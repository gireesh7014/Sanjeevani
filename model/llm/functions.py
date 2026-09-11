"""
Function-calling actions available to Gemma's triage stage.

`TriageResult.next_action` (see reasoning.py) names one of these
functions; model/pipeline.py executes it after getting the triage
judgment back. This is the "function calling" stage from the
redesign: Gemma decides what should happen next, and the backend
carries it out.

Only two actions exist right now, both intentionally simple:
  - emergency_escalation: no external call — just a strong, structured
    signal the frontend uses to show an urgent banner instead of a
    normal answer card.
  - find_nearest_hospital: a PLACEHOLDER. No hospital directory / maps
    API is wired up yet, so this returns a clear placeholder note
    rather than pretending to have located a real facility. Swap the
    body of this function for a real lookup (e.g. a facility registry,
    or a maps API) when you have one to connect.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class FacilityInfo:
    """One nearby health facility, structured for the frontend card."""

    name: str
    lat: float | None = None
    lng: float | None = None
    maps_url: str | None = None
    kind: str = "hospital"  # hospital | clinic


@dataclass
class FunctionCallResult:
    action: str
    note: str
    facilities: list[FacilityInfo] = field(default_factory=list)


def emergency_escalation() -> FunctionCallResult:
    return FunctionCallResult(
        action="emergency_escalation",
        note="This sounds urgent. Call 108 (India's emergency ambulance number) or go to "
        "the nearest hospital now.",
    )


def find_nearest_hospital(speciality: str = "General Medicine", lat: float | None = None, lng: float | None = None) -> FunctionCallResult:
    """Finds real nearby hospitals using the Overpass API if coordinates are given."""
    if lat is None or lng is None:
        return FunctionCallResult(
            action="find_nearest_hospital",
            note="I cannot find nearby hospitals because your location is not available. Please allow location access in your browser or ask your local ASHA worker."
        )

    import requests
    
    overpass_url = "http://overpass-api.de/api/interpreter"
    overpass_query = f"""
    [out:json];
    (
      node["amenity"="hospital"](around:10000,{lat},{lng});
      node["amenity"="clinic"](around:10000,{lat},{lng});
    );
    out body 5;
    """
    
    try:
        headers = {'User-Agent': 'SanjeevaniBot/1.0'}
        response = requests.get(overpass_url, params={'data': overpass_query}, headers=headers, timeout=15)
        response.raise_for_status()
        data = response.json()
        elements = data.get("elements", [])
        
        if not elements:
            return FunctionCallResult(
                action="find_nearest_hospital",
                note="I couldn't find any hospitals within 10km of your location using OpenStreetMap. Please call 108 in an emergency."
            )
            
        facilities: list[FacilityInfo] = []
        for el in elements[:5]:
            tags = el.get("tags", {})
            h_lat, h_lon = el.get("lat"), el.get("lon")
            maps_link = (
                f"https://www.google.com/maps/dir/?api=1&destination={h_lat},{h_lon}"
                if h_lat is not None and h_lon is not None else None
            )
            facilities.append(FacilityInfo(
                name=tags.get("name", "Medical Facility"),
                lat=h_lat, lng=h_lon, maps_url=maps_link,
                kind="clinic" if tags.get("amenity") == "clinic" else "hospital",
            ))

        names = ", ".join(f.name for f in facilities[:3])
        note = (
            f"Nearest facilities from OpenStreetMap (within 10 km): {names}. "
            "Open the list below for directions."
        )
        return FunctionCallResult(action="find_nearest_hospital", note=note, facilities=facilities)
        
    except Exception as exc:
        return FunctionCallResult(
            action="find_nearest_hospital",
            note="I tried to find a nearby hospital, but the mapping service is currently unavailable. Please ask a local health worker."
        )


def dispatch(next_action: str, lat: float | None = None, lng: float | None = None) -> FunctionCallResult | None:
    """Maps a TriageResult.next_action string to the function it names."""
    if next_action == "emergency_escalation":
        return emergency_escalation()
    if next_action == "find_nearest_hospital":
        return find_nearest_hospital(lat=lat, lng=lng)
    return None
