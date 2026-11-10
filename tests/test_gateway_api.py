import asyncio
import unittest

from _load import HTTPException, PluginLlmTrustError, Usage, api, callwatch, fake_model, gateway, library, reset, run, sample, store


def request(kind="findings"):
    t = library.target({"findings": "pass:weakest", "note": "method:reader", "changes": "pass:typos", "openings": "openings"}[kind])
    s = sample()
    return library.build_request(t, s["title"], s["body"])


class GatewayTest(unittest.TestCase):
    def setUp(self):
        reset()
        self.llm = fake_model()

    def ask(self, kind="findings"):
        return run(api.EDITOR.ask(request(kind)))

    def code(self, kind="findings"):
        with self.assertRaises(gateway.EditorError) as cm:
            self.ask(kind)
        return cm.exception.code

    def test_answer_with_model_and_tokens_on_our_own_task(self):
        self.llm.queue = [{"summary": "ok", "findings": []}]
        a = self.ask()
        self.assertEqual((a["model"], a["tokens_out"], a["finish_reason"]), ("test-model-1", 300, "stop"))
        call = self.llm.calls[0]
        self.assertEqual((call["task"], call["timeout"]), ("clearing_editor", gateway.TIMEOUT))
        self.assertIsNotNone(call["json_schema"])

    def test_cut_off_three_ways(self):
        self.llm.finish = "length"
        self.assertEqual(self.code(), "cut_off")  # the hook's finish reason
        self.llm.finish = None  # the hook did not fire (no relay context)
        self.llm.queue = [({"summary": "ok", "findings": []}, Usage(o=8900))]
        self.assertEqual(self.code(), "cut_off")  # the token ceiling
        self.llm.finish = "stop"
        self.llm.queue = ['{"summary": "half an ans']
        self.assertEqual(self.code(), "cut_off")  # an unfinished object
        self.llm.queue = ["Sorry, I can't do that."]
        self.assertEqual(self.code(), "unreadable")

    def test_a_clean_finish_near_the_ceiling_is_kept(self):
        # a reasoning model counts its thinking as output tokens; the hook said "stop" and the JSON is whole
        self.llm.finish = "stop"
        self.llm.queue = [({"summary": "ok", "findings": []}, Usage(o=8900))]
        self.assertEqual(self.ask()["data"]["summary"], "ok")
        self.llm.finish = "end_turn"
        self.llm.queue = [({"summary": "ok", "findings": []}, Usage(o=8999))]
        self.assertEqual(self.ask()["data"]["summary"], "ok")

    def test_a_secret_in_the_draft_is_scrubbed_before_sending(self):
        seen = []
        orig = gateway.scrub
        gateway.scrub = lambda text: (seen.append(text), text.replace("sk-live-123", "[REDACTED]"))[1]
        try:
            req = request()
            req["input"] += " my key is sk-live-123"
            self.llm.queue = [{"summary": "ok", "findings": []}]
            run(api.EDITOR.ask(req))
        finally:
            gateway.scrub = orig
        sent = self.llm.calls[0]["input"][0]["text"]
        self.assertNotIn("sk-live-123", sent)
        self.assertIn("[REDACTED]", sent)

    def test_schema_miss_is_retried_as_plain_json(self):
        self.llm.queue = [ValueError("Plugin LLM structured output did not match schema: x"), '```json\n{"summary": "ok", "findings": []}\n```']
        self.assertEqual(self.ask()["data"]["summary"], "ok")
        self.assertIsNone(self.llm.calls[1]["json_schema"])
        self.assertTrue(self.llm.calls[1]["json_mode"])

    def test_failures_map_to_plain_codes(self):
        self.llm.queue = [PluginLlmTrustError("plugin 'clearing' may not override the model")]
        self.assertEqual(self.code(), "no_model")
        self.llm.queue = [RuntimeError("Error code: 429 - rate limit")]
        self.assertEqual(self.code(), "busy")
        self.llm.queue = [asyncio.TimeoutError()]
        self.assertEqual(self.code(), "slow")
        self.llm.queue = [RuntimeError("no provider configured for auxiliary")]
        self.assertEqual(self.code(), "no_model")
        AuxiliaryClientUnavailable = type("AuxiliaryClientUnavailable", (RuntimeError,), {})
        self.llm.queue = [AuxiliaryClientUnavailable("No LLM provider configured for task=clearing_editor provider=auto. Run: hermes setup")]
        self.assertEqual(self.code(), "no_model")  # Hermes's real message; "unavailable" must not read as busy
        self.llm.queue = [RuntimeError("Error code: 503 - service unavailable")]
        self.assertEqual(self.code(), "busy")
        APIConnectionError = type("APIConnectionError", (Exception,), {})
        self.llm.queue = [APIConnectionError("Connection error.")]
        self.assertEqual(self.code(), "unreachable")
        self.llm.queue = [KeyError("weird")]
        self.assertEqual(self.code(), "failed")

    def test_unregistered_task_falls_back_to_the_main_model(self):
        self.llm.queue = [PluginLlmTrustError("cannot route through auxiliary task 'clearing_editor'"), {"summary": "ok", "findings": []}]
        self.ask()
        self.assertEqual([c["task"] for c in self.llm.calls], ["clearing_editor", None])


class CallwatchTest(unittest.TestCase):
    def test_ignores_other_tasks_and_finds_its_own_call(self):
        token = callwatch.begin("call-1")
        callwatch.on_post_auxiliary_call(aux_task="title_generation", finish_reason="length")
        callwatch.on_post_auxiliary_call(aux_task="clearing_editor", finish_reason="stop", usage={"completion_tokens": 7})
        rec = callwatch.end(token, "call-1")
        self.assertEqual((rec["finish_reason"], rec["output_tokens"]), ("stop", 7))
        import time
        self.assertIsNone(callwatch.end(callwatch.begin("call-2"), "call-2", time.time() + 1))

    def test_task_fallback_when_the_context_did_not_reach_the_hook(self):
        callwatch.on_post_auxiliary_call(aux_task="clearing_editor", finish_reason="length")
        self.assertEqual(callwatch.end(callwatch.begin("call-3"), "call-3", 0)["finish_reason"], "length")

    def test_a_broken_event_never_raises(self):
        callwatch.on_post_auxiliary_call(aux_task="clearing_editor", usage="not a dict")
        callwatch.on_post_auxiliary_call()
        callwatch.end(callwatch.begin("cleanup"), "cleanup", 0)


class ApiTest(unittest.TestCase):
    def setUp(self):
        reset()
        self.llm = fake_model()

    def test_first_run_seeds_the_sample_once(self):
        state = run(api.get_state())
        self.assertEqual(state["current"]["title"], "The room nobody counts")
        self.assertTrue(state["current"]["sample"])
        run(api.post_trash(state["current"]["id"]))
        again = run(api.get_state())
        self.assertNotEqual(again["current"]["title"], "The room nobody counts")  # a fresh blank piece, no reseed

    def test_a_pass_end_to_end(self):
        piece = run(api.get_state())["current"]
        self.llm.queue = [{"summary": "Two weak spots.", "findings": [
            {"quote": "It is important to note that", "issue": "Does the sentence start sooner without it?"},
            {"quote": "a line nobody wrote", "issue": "dropped"}]}]

        async def scenario():
            started = await api.post_pass({"piece_id": piece["id"], "target": "pass:weakest", "body": piece["body"], "title": piece["title"]})
            self.assertEqual(started["status"], "running")
            await api._jobs[started["id"]]
            return await api.get_pass(started["id"])
        done = run(scenario())
        self.assertEqual(done["status"], "done")
        self.assertEqual(done["model"], "test-model-1")
        self.assertEqual([f["quote"] for f in done["result"]["findings"]], ["It is important to note that"])
        self.assertEqual(done["result"]["counts"]["dropped"], 1)
        self.assertEqual(store.get_piece(piece["id"])["body"], piece["body"])  # the manuscript never changes

    def test_cuts_and_wording_end_to_end(self):
        piece = run(api.get_state())["current"]
        at = piece["body"].index("modest")
        self.llm.queue = [{"summary": "One cut.", "cuts": [{"quote": "That number is real.", "reason": "Concedes early."}]},
                          {"options": [{"text": "small", "why": "plainer"}, {"text": "minor", "why": "smaller"}]}]

        async def scenario(target, selection=None):
            started = await api.post_pass({"piece_id": piece["id"], "target": target, "body": piece["body"], "title": piece["title"], "selection": selection})
            await api._jobs[started["id"]]
            return await api.get_pass(started["id"])
        cut = run(scenario("cut"))
        self.assertEqual(cut["kind"], "cuts")
        self.assertEqual([c["quote"] for c in cut["result"]["cuts"]], ["That number is real."])
        words = run(scenario("wording", {"start": at, "end": at + 6}))
        self.assertEqual(words["status"], "done")
        self.assertEqual(words["selection"], {"start": at, "end": at + 6})
        self.assertEqual([o["text"] for o in words["result"]["options"]], ["small", "minor"])
        with self.assertRaises(HTTPException) as cm:
            run(api.post_pass({"piece_id": piece["id"], "target": "wording", "body": piece["body"]}))
        self.assertEqual(cm.exception.status_code, 400)
        self.assertEqual(store.get_piece(piece["id"])["body"], piece["body"])

    def test_failures_keep_the_draft_and_say_what_to_do(self):
        piece = run(api.get_state())["current"]
        cases = [(PluginLlmTrustError("denied"), "no_model"), ({"summary": "x", "findings": [{"quote": "zzz qqq", "issue": "?"}]}, "unmatched")]
        for answer, code in cases:
            self.llm.queue = [answer]

            async def scenario():
                started = await api.post_pass({"piece_id": piece["id"], "target": "pass:weakest"})
                await api._jobs[started["id"]]
                return await api.get_pass(started["id"])
            done = run(scenario())
            self.assertEqual((done["status"], done["code"]), ("failed", code))
            self.assertEqual(done["message"], gateway.MESSAGES[code])
        self.assertEqual(store.get_piece(piece["id"])["body"], piece["body"])

    def test_one_pass_at_a_time_and_stop(self):
        piece = run(api.get_state())["current"]
        self.llm.delay = 5

        async def scenario():
            first = await api.post_pass({"piece_id": piece["id"], "target": "pass:hedges"})
            with self.assertRaises(HTTPException) as cm:
                await api.post_pass({"piece_id": piece["id"], "target": "pass:long"})
            self.assertEqual(cm.exception.status_code, 409)
            return await api.post_stop(first["id"])
        stopped = run(scenario())
        self.assertEqual((stopped["status"], stopped["message"]), ("stopped", gateway.MESSAGES["stopped"]))

    def test_too_long_is_refused_before_sending(self):
        piece = run(api.get_state())["current"]
        with self.assertRaises(HTTPException) as cm:
            run(api.post_pass({"piece_id": piece["id"], "target": "pass:weakest", "body": "word " * 30000}))
        self.assertEqual(cm.exception.status_code, 400)
        self.assertEqual(self.llm.calls, [])

    def test_save_versions_finish_routes(self):
        piece = run(api.get_state())["current"]
        run(api.post_save(piece["id"], {"body": piece["body"] + "\n\nOne more line."}))
        run(api.post_version(piece["id"], {"reason": "idle"}))
        done = run(api.post_finish(piece["id"], {}))
        versions = run(api.get_versions(piece["id"]))
        self.assertEqual(versions["finished"], done["finished_version"])
        self.assertEqual(versions["versions"][0]["label"], "Marked finished")
        with self.assertRaises(HTTPException) as cm:
            run(api.get_piece("missing"))
        self.assertEqual(cm.exception.status_code, 404)

    def test_thesaurus_shards(self):
        shard = run(api.get_thesaurus("mo"))
        self.assertIn("modest", shard["w"])
        self.assertEqual(run(api.get_thesaurus("__"))["w"].__class__, dict)
        for bad in ("../x", "MO", "abc", ""):
            with self.assertRaises(HTTPException) as cm:
                run(api.get_thesaurus(bad))
            self.assertEqual(cm.exception.status_code, 404)

    def test_word_version_reason(self):
        piece = run(api.get_state())["current"]
        v = run(api.post_version(piece["id"], {"reason": "word", "title": piece["title"], "body": piece["body"] + " x"}))
        self.assertEqual(v["version"]["label"] if "version" in v else v["label"], "Before trying another word")


if __name__ == "__main__":
    unittest.main()


class PlainErrorTest(unittest.TestCase):
    """Only sentences The Clearing wrote reach the writer; parser and key errors become a plain retry."""

    def detail(self, e):
        with self.assertRaises(HTTPException) as cm:
            api._fail(e)
        return cm.exception.status_code, cm.exception.detail

    def test_own_sentences_pass_through(self):
        self.assertEqual(self.detail(ValueError("The page is empty. Write a little first, then ask.")), (400, "The page is empty. Write a little first, then ask."))
        self.assertEqual(self.detail(LookupError("That piece is no longer here.")), (404, "That piece is no longer here."))

    def test_internal_text_never_reaches_the_writer(self):
        import json
        try:
            json.loads("")
        except ValueError as e:
            code, text = self.detail(e)
        self.assertEqual((code, text), (400, "The Clearing couldn't do that. Try again."))
        self.assertEqual(self.detail(KeyError("h12")), (404, "That piece or version is no longer here."))
        self.assertEqual(self.detail(ValueError("unreadable"))[1], "The Clearing couldn't do that. Try again.")
        self.assertEqual(self.detail(ValueError(""))[1], "The Clearing couldn't do that. Try again.")
        self.assertNotIn("Error", self.detail(RuntimeError("boom"))[1])
