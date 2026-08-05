import importlib.util
from pathlib import Path
import unittest

MODULE_PATH = Path(__file__).parents[1] / "scripts" / "fetch_listings.py"
SPEC = importlib.util.spec_from_file_location("fetch_listings", MODULE_PATH)
SCORER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SCORER)


class ScoringTests(unittest.TestCase):
    def base(self, description):
        return {"id":"test","title":"2001 BMW Z3 2.2 Roadster","description":description,"price":5500,"mileage":70000,"year":2001,"engine":"2.2"}

    def test_documented_car_scores_above_damaged_car(self):
        good = SCORER.score_listing(self.base("Full service history, garaged, no rust, 12 months MOT and recently serviced"))
        bad = SCORER.score_listing(self.base("Cat N damaged project, no service history, rust and roof leak"))
        self.assertGreater(good["conditionScore"], bad["conditionScore"])
        self.assertLessEqual(bad["conditionScore"], 2)

    def test_price_changes_deal_not_condition(self):
        cheap = self.base("Service history")
        dear = dict(cheap, id="dear", price=10000)
        cheap = SCORER.score_listing(cheap)
        dear = SCORER.score_listing(dear)
        self.assertGreater(cheap["dealScore"], dear["dealScore"])
        self.assertEqual(cheap["conditionScore"], dear["conditionScore"])

    def test_score_bounds(self):
        result = SCORER.score_listing(self.base("Cat N damaged project no history rust corrosion roof leak warning light"))
        self.assertGreaterEqual(result["overallScore"], 1)
        self.assertLessEqual(result["overallScore"], 10)


if __name__ == "__main__":
    unittest.main()
