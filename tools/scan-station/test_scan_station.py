"""Tests for the scan station's pure steps.  python -m unittest tools/scan-station/test_scan_station.py"""
import unittest
from scan_station import assigned_readings, failure, match, number_pages, paragraph_flags, paragraphs, running_head


def page(printed):
    return {"printed": printed, "flags": [], "paragraphs": []}


class RunningHead(unittest.TestCase):
    def test_number_before_and_after_the_title(self):
        self.assertEqual(running_head(["144 Chapter 2 THE CONCEPT OF \"POSSESSION\"", "handed over"]), (144, 1))
        self.assertEqual(running_head(["III. POSSESSION IN RELATION TO LAND 167", "that courts"]), (167, 1))
        self.assertEqual(running_head(["CHAPTER 2 THE CONCEPT", "144", "text"]), (144, 2))
        self.assertEqual(running_head(['[170] CHAPTER 2 THE CONCEPT OF "POSSESSION"', "text"]), (170, 1))

    def test_body_text_is_not_a_head(self):
        self.assertEqual(running_head(["In 1983, The Toronto Star reported", "more"]), (None, 0))


class Paragraphs(unittest.TestCase):
    def test_joins_lines_and_splits_at_paragraph_numbers(self):
        out = paragraphs(["[1] Can private landowners gain", "title over parkland?", "[2] The appellants own a prop-", "erty near the Humber River."])
        self.assertEqual(out, ["[1] Can private landowners gain title over parkland?", "[2] The appellants own a property near the Humber River."])

    def test_drops_a_repeated_line_from_a_model_loop(self):
        line = "Disposal Regulations, above."
        self.assertEqual(paragraphs([line, "", line, "", line]), [line])


class Numbers(unittest.TestCase):
    def test_repairs_a_misread_number_and_fills_a_missing_one(self):
        pages = [page(157), page(4158), page(159), page(None)]
        number_pages(pages)
        self.assertEqual([p["printed"] for p in pages], [157, 158, 159, 160])
        self.assertTrue(pages[1]["flags"] and pages[3]["flags"])

    def test_repairs_a_misread_number_next_to_a_missing_one(self):
        pages = [page(168), page(169), page(None), page(1711), page(172), page(None)]
        number_pages(pages)
        self.assertEqual([p["printed"] for p in pages], [168, 169, 170, 171, 172, 173])

    def test_a_skipped_page_is_not_papered_over(self):
        pages = [page(150), page(151), page(153), page(154)]
        number_pages(pages)
        self.assertEqual([p["printed"] for p in pages], [150, 151, 153, 154])

    def test_flags_paragraph_numbers_that_step_back(self):
        pages = [page(171), page(172)]
        pages[0]["paragraphs"] = ["[33] a", "[34] b"]
        pages[1]["paragraphs"] = ["[31] c", "[42] d"]
        paragraph_flags(pages)
        self.assertEqual(pages[1]["flags"], ["paragraph [31] follows [34]"])


class Failure(unittest.TestCase):
    def test_catches_the_loops_seen_on_real_pages(self):
        self.assertEqual(failure("III. POSSESSION 10452 In the last year, the first year " + "of the last year " * 300), "the same words over and over")
        self.assertEqual(failure("POSSESSION in RELATION TO LAND 6572019191919191919191919191 " + "word " * 60), "a run of digits")
        self.assertEqual(failure("145"), "almost no text")

    def test_passes_a_real_page(self):
        page = open(__file__.replace("test_scan_station.py", "README.md"), encoding="utf-8").read()
        self.assertEqual(failure(page), "")


LECTURES = [
    {"id": "a", "title": "W5A: Possession and Possessory Title to Land", "notes": "READINGS\n• Property: Cases and Commentary, pp. 144–188", "courseId": "prop"},
    {"id": "b", "title": "W5B: Possession and Intention", "notes": "READINGS\n• Property: Cases and Commentary, pp. 188–200", "courseId": "prop"},
    {"id": "c", "title": "Torts W5", "notes": "READINGS\n• Torts casebook, pp. 140–190", "courseId": "torts"},
]
COURSES = {"prop": "LAW 183: Property Law", "torts": "LAW 195: Torts"}


class Matching(unittest.TestCase):
    def test_file_name_picks_the_course_when_page_ranges_collide(self):
        reading, problem = match(144, 189, "Property pp. 144-188", assigned_readings(LECTURES, COURSES))
        self.assertEqual((reading["lecture"]["id"], problem), ("a", ""))

    def test_ambiguous_without_a_name(self):
        reading, problem = match(144, 189, "Scanned Document", assigned_readings(LECTURES, COURSES))
        self.assertIsNone(reading)
        self.assertIn("more than one", problem)

    def test_no_overlap(self):
        self.assertEqual(match(500, 510, "Property", assigned_readings(LECTURES, COURSES))[0], None)


if __name__ == "__main__":
    unittest.main()
