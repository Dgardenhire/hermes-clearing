"""The built-in scenes reach the page through the plugin's own route (GET /scene/builtin/{name}) instead of
inside plugin.js: the right photograph for each name, a hash the page can check against its own manifest, and
nothing else served from the plugin's folder."""
import base64
import hashlib
import json
import re
import unittest

from _load import ROOT, HTTPException, api, run


def manifest():
    js = (ROOT / "desktop" / "src" / "assets.gen.js").read_text(encoding="ascii")
    return json.loads(re.search(r"^export const SCENES = (\{.*\})$", js, re.M).group(1))


class BuiltinSceneTest(unittest.TestCase):
    def test_each_scene_is_its_own_photograph_with_the_hash_the_page_expects(self):
        want = manifest()
        self.assertEqual(set(want), set(api.SCENES))
        for name, (file, mime) in api.SCENES.items():
            r = run(api.get_builtin_scene(name))
            raw = (ROOT / "desktop" / "assets" / file).read_bytes()
            self.assertEqual(base64.b64decode(r["data"]), raw)
            self.assertEqual(r["mime"], mime)
            self.assertEqual(r["hash"], hashlib.sha256(raw).hexdigest()[:12])
            self.assertEqual(r["hash"], want[name]["hash"], "run scripts/embed_assets.py")
            self.assertEqual(want[name]["file"], file)

    def test_only_the_three_scenes_are_served(self):
        for name in ("own", "plain", "../plugin", "snow-light.jpg", "libre-caslon-text", ""):
            with self.assertRaises(HTTPException) as e:
                run(api.get_builtin_scene(name))
            self.assertEqual(e.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
