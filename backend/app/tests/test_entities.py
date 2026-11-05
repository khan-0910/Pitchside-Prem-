from datetime import date

import pytest

from app.data.matching.players import PlayerMatcher, PlayerRecord, canonical_player_id
from app.data.matching.teams import TeamResolver
from app.data.normalizers.names import normalize_name, normalize_team


def test_normalizers_strip_accents_and_punctuation():
    assert normalize_name("Martin Ødegaard") == "martin odegaard"
    assert normalize_name("N'Golo Kanté") == "ngolo kante"
    assert normalize_team("AFC Bournemouth") == "bournemouth"
    assert normalize_team("Brighton & Hove Albion FC") == "brighton and hove albion"


@pytest.mark.parametrize("name", ["Manchester United", "Man United", "Manchester Utd", "Man Utd",
                                  "Manchester United FC", "Manchester United Football Club"])
def test_manchester_united_spellings_resolve_to_one_team(con, name):
    assert TeamResolver(con).match("x", name, name).team_id == "man-united"


def test_city_and_united_stay_apart(con):
    assert TeamResolver(con).match("x", "1", "Manchester City FC").team_id == "man-city"


@pytest.mark.parametrize("name", ["Manchester", "Sheffield", "Inter Milan", "United"])
def test_ambiguous_or_unknown_team_is_never_auto_accepted(con, name):
    resolver = TeamResolver(con)
    assert resolver.match("x", name, name).team_id is None
    assert resolver.resolve("x", name, name) is None
    assert con.execute("SELECT count(*) FROM unresolved_entities").fetchone()[0] == 1


def test_fuzzy_typo_is_accepted_with_lower_confidence(con):
    m = TeamResolver(con).match("x", "1", "Crystal Pallace")
    assert m.team_id == "crystal-palace"
    assert m.method == "fuzzy" and m.confidence < 1


def test_manual_override_beats_everything(con):
    con.execute(
        """INSERT INTO manual_entity_overrides (entity_type, source_id, external_id, entity_id)
           VALUES ('team', 'x', 'odd', 'hull')""")
    assert TeamResolver(con).match("x", "odd", "Arsenal").team_id == "hull"


def test_resolved_mapping_is_stored_for_audit(con):
    TeamResolver(con).resolve("x", "42", "Spurs")
    row = con.execute("SELECT team_id, source_name, method FROM team_source_ids").fetchone()
    assert row == ("tottenham", "Spurs", "alias")


POOL = [
    PlayerRecord("a", ("Ben White",), date(1997, 10, 8), "arsenal", "Defender"),
    PlayerRecord("b", ("Ben Davies",), date(1993, 4, 24), "tottenham", "Defender"),
    PlayerRecord("c", ("Ben Davies",), date(1995, 8, 11), "liverpool", "Defender"),
    PlayerRecord("d", ("Matheus Cunha",), date(1999, 5, 27), "man-united", "Forward"),
    PlayerRecord("e", ("Sam Johnstone",), None, "wolves", "Goalkeeper"),
    PlayerRecord("f", ("Twin One",), date(2001, 1, 1), "hull", "Midfielder"),
    PlayerRecord("g", ("Twin Two",), date(2001, 1, 1), "hull", "Midfielder"),
]


def test_same_name_is_split_by_date_of_birth():
    m = PlayerMatcher(POOL).match(PlayerRecord("q", ("Ben Davies",), date(1995, 8, 11)))
    assert m.player_id == "c"


def test_long_legal_name_matches_on_birth_date():
    q = PlayerRecord("q", ("Matheus Santos Carneiro da Cunha",), date(1999, 5, 27), "man-united")
    m = PlayerMatcher(POOL).match(q)
    assert m.player_id == "d" and m.confidence >= 0.8


def test_different_birth_dates_never_match_on_name():
    m = PlayerMatcher(POOL).match(PlayerRecord("q", ("Ben White",), date(2004, 2, 2), "arsenal",
                                               "Defender"))
    assert m.player_id is None


def test_same_birth_date_but_different_name_is_rejected():
    m = PlayerMatcher(POOL).match(PlayerRecord("q", ("Zzz Qqq",), date(1997, 10, 8)))
    assert m.player_id is None


def test_tied_candidates_are_ambiguous():
    m = PlayerMatcher(POOL).match(PlayerRecord("q", ("Twin",), date(2001, 1, 1)))
    assert m.player_id is None and m.reason == "ambiguous"


def test_no_birth_date_needs_team_position_and_strong_name():
    matcher = PlayerMatcher(POOL)
    hit = matcher.match(PlayerRecord("q", ("Sam Johnstone",), None, "wolves", "Goalkeeper"))
    assert hit.player_id == "e"
    assert matcher.match(PlayerRecord("q", ("Sam Johnstone",), None, "hull", "Goalkeeper")) \
        .player_id is None
    assert matcher.match(PlayerRecord("q", ("Sam Johnstone",), None, "wolves", "Forward")) \
        .player_id is None


def test_canonical_ids_are_stable():
    assert canonical_player_id("fpl", "1") == canonical_player_id("fpl", "1")
    assert canonical_player_id("fpl", "1") != canonical_player_id("transfermarkt", "1")
