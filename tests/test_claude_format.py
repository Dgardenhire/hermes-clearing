"""Nov 10 live failure: on the Claude route Hermes refuses json_mode ("Only json_schema structured output is
supported") and Claude's strict mode can reject a schema with a 400. The Clearing must then ask for the JSON in
plain words and read it out of the reply, the way Imprint does, and its debug note must never carry the writer's words."""
import os
import unittest
from pathlib import Path

from _load import FakeLlm, gateway, reset, run

ANSWER = '{"summary": "Fine.", "findings": []}'
SCHEMA = {"type": "object", "properties": {"summary": {"type": "string"}, "findings": {"type": "array"}}}


def claude(kw):
    """The Claude route as Hermes presents it: no json_mode, no loose schema, plain requests answered."""
    if kw.get("json_mode"):
        return ValueError("Only json_schema structured output is supported for this provider")
    if kw.get("json_schema") is not None:
        return RuntimeError("Error code: 400 - invalid_request_error: output_config.format.schema: "
                            "additionalProperties must be explicitly set to false")
    return ANSWER


def request(body="The branch library opens at ten."):
    return {"system": "You are an editor.", "input": body, "instructions": "Read the piece.",
            "max_tokens": 2000, "schema": SCHEMA}


class ClaudeFormat(unittest.TestCase):
    def setUp(self):
        reset()
        self.llm = FakeLlm()
        self.editor = gateway.Editor(self.llm)

    def test_schema_refused_then_plain_answer_is_read(self):
        self.llm.queue = [claude] * 4
        out = run(self.editor.ask(request()))
        self.assertEqual(out["data"]["summary"], "Fine.")
        last = self.llm.calls[-1]
        self.assertIsNone(last["json_schema"])
        self.assertFalse(last["json_mode"])
        self.assertIn("Reply with one complete JSON object", last["instructions"])
        self.assertIn('"summary"', last["instructions"])  # the schema travels in the prompt
        self.assertTrue(self.editor.plain)

    def test_schema_miss_then_json_mode_refused_still_answers(self):
        self.llm.queue = [ValueError("The reply did not match the requested schema"), claude, claude]
        out = run(self.editor.ask(request()))
        self.assertEqual(out["data"]["findings"], [])
        self.assertTrue(self.llm.calls[1]["json_mode"])  # the original R11 retry ran first
        self.assertFalse(self.llm.calls[-1]["json_mode"])

    def test_plain_sticks_one_call_per_pass(self):
        self.llm.queue = [claude] * 6
        run(self.editor.ask(request()))
        before = len(self.llm.calls)
        run(self.editor.ask(request()))
        self.assertEqual(len(self.llm.calls) - before, 1)

    def test_three_passes_at_once_all_recover(self):
        import asyncio
        self.llm.queue = [claude] * 12

        async def three():
            return await asyncio.gather(*(self.editor.ask(request()) for _ in range(3)))

        outs = run(three())
        self.assertEqual([o["data"]["summary"] for o in outs], ["Fine."] * 3)

    def test_other_failures_still_reach_the_page(self):
        self.llm.queue = [RuntimeError("Error code: 529 - overloaded")]
        with self.assertRaises(gateway.EditorError) as cm:
            run(self.editor.ask(request()))
        self.assertEqual(cm.exception.code, "busy")
        self.assertFalse(self.editor.plain)

    def test_debug_note_carries_no_words(self):
        self.llm.queue = [RuntimeError("Error code: 400 - bad input near 'SECRETWORD in the piece' json_schema")] + [claude] * 2
        run(self.editor.ask(request(body="SECRETWORD in the piece")))
        log = Path(os.environ["CLEARING_DATA_DIR"]) / "debug.log"
        text = log.read_text("utf-8")
        self.assertIn("RuntimeError", text)
        self.assertNotIn("SECRETWORD", text)


if __name__ == "__main__":
    unittest.main()
