from enum import Enum

class systemMessage(Enum):
	login = """
New sign-in to account!
System: {system}
Device: {device}
Location: {location}
	""".strip()
