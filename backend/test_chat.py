from intent import detect_intent

# (message, expected intent, context, expected item or None, expected center or None)
CASES = [
    ("asa man ta maka palit og tambal?", "find_medicine_location", {}, None, None),
    ("naa moy tambal para hilanat?", "clarification", {}, None, None),
    ("do you have paracetamol?", "medicine_availability", {}, "Paracetamol", None),
    ("is amoxicillin available?", "medicine_availability", {}, "Amoxicillin 250mg", None),
    ("amox", "medicine_availability", {}, "Amoxicillin 250mg", None),
    ("paracetamul", "medicine_availability", {}, "Paracetamol", None),
    ("open pa ba ang health center?", "clinic_hours", {}, None, None),
    ("unsa nga bakuna inyong available?", "medicine_search", {}, None, None),
    ("where can I find the nearest health center?", "find_health_center", {}, None, None),
    ("magkano ang paracetamol?", "medicine_price", {}, None, None),
    ("libre ba ang bioflu?", "free_medicine_inquiry", {}, None, None),
    ("unsa ang dosage sa paracetamol?", "medical_advice", {}, None, None),
    ("salamat", "thanks", {}, None, None),
    ("hello", "greeting", {}, None, None),
    ("asdfgh qwerty", "unknown", {}, None, None),
    ("which medicines are available?", "medicine_search", {}, None, None),
    ("asa naa ang Metformin", "find_medicine_location", {}, "Metformin", None),
    ("aha mana ma kuha?", "find_medicine_location", {"last_item": "Metformin"}, "Metformin", None),
    ("naa ba mana?", "medicine_availability", {"last_item": "Metformin"}, "Metformin", None),
    ("what about the provincial center?", "medicine_availability", {"last_item": "Paracetamol"}, "Paracetamol", None),
    ("unsa ilang oras?", "clinic_hours", {"last_center": 2}, None, 2),
]

passed = failed = 0
for text, want_intent, ctx, want_item, want_center in CASES:
    d = detect_intent(text, 1, ctx)
    ok = d["intent"] == want_intent
    if want_item is not None:
        ok = ok and d["item"] == want_item
    if want_center is not None:
        ok = ok and d["center"] == want_center
    status = "PASS" if ok else "FAIL"
    passed += ok
    failed += (not ok)
    print(f"{status}  {text!r:50} -> {d['intent']:24} item={d['item']} center={d['center']}")

print(f"\n{passed} passed, {failed} failed")