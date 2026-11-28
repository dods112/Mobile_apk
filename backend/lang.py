import re

BISAYA = re.compile(
    r"\b(unsa|unsay|nang|naa|naay|asa|ba|ko|mo|imo|nimo|nako|dili|wala|diha|dinhi|karon|ron|"
    r"para|sa|og|ug|kini|kana|ngano|kinsa|kaila|gamit|tambal|bakuna|pila|ilang|bukas|sirado|"
    r"pinakaduol|tabang|salamat|kumusta|maayong|mana|kuha|palit|makuha|tan|awon|kasabot|ngadto|"
    r"abli|sarado|ako|ikaw|siya|kita|kamo|sila|kaayo|lang|pa|na|ni|ng|oy|mao|usa|duha|tanan)\b",
    re.IGNORECASE,
)
ENGLISH = re.compile(
    r"\b(what|is|are|for|does|do|how|when|where|which|who|the|can|you|your|open|close|closed|"
    r"hours|available|stock|time|nearest|service|services|medicine|medicines|vaccine|vaccines|"
    r"please|thanks|thank|hello|hi|good|morning|tell|me|about|need|want|have|has|with|this|that)\b",
    re.IGNORECASE,
)

def detect(message, default="en"):
    text = message or ""
    b = len(BISAYA.findall(text))
    e = len(ENGLISH.findall(text))
    if b == 0 and e == 0:
        return default
    if b > e:
        return "ceb"
    if e > b:
        return "en"
    return default