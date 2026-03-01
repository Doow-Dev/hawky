# Hawky Leaderboard

_Project-specific scores. Updated by Godel after each sprint._

---

## All-Time Standings (This Project)

| Agent | Total Pts | MVPs | Top 3s | Streak | Titles |
|-------|-----------|------|--------|--------|--------|
| Luna | 42 | 1 | 5 | 0 | Volume King |
| Nova | 32 | 1 | 5 | 5 | Clean Sweep |
| Kai | 12 | 0 | 2 | 0 | |
| Maya | 5 | 0 | 0 | 0 | |
| Hawk | -3 | 0 | 0 | 0 | |
| Godel | -15 | 0 | 0 | 0 | |

---

## Sprint History

### Sprint 8: E008 + E011 (Visual + Stack Modules)
_Date: 2026-03-01_

| Agent | Stories | Quality | Unblock | Penalties | Total |
|-------|---------|---------|---------|-----------|-------|
| Nova | +6 (E008) | +2 | +1 | 0 | **+9** |
| Luna | +10 (E011) | +2 | +1 | 0 | **+13** |
| Kai | +2 (review) | +2 | +1 | 0 | **+5** |
| Maya | +3 (README) | +1 | 0 | 0 | **+4** |
| Godel | +1 (coord) | 0 | 0 | -3 (no tracking) | **-2** |

**MVP:** Luna (shipped entire stack module architecture)

---

### Sprint 7: E007 Frontend Checks
_Date: 2026-02-28_

| Agent | Stories | Quality | Unblock | Penalties | Total |
|-------|---------|---------|---------|-----------|-------|
| Nova | +12 | +2 | +1 | 0 | **+15** |
| Kai | +1 (review) | +1 | 0 | 0 | **+2** |

**MVP:** Nova (12 frontend checks, all complete)

---

### Sprint 6: E005 + E006 (Coordination + Sprint Integration)
_Date: 2026-02-27_

| Agent | Stories | Quality | Unblock | Penalties | Total |
|-------|---------|---------|---------|-----------|-------|
| Luna | +18 | +2 | +2 | -1 (S044 missing) | **+21** |
| Kai | +2 (review) | +1 | 0 | 0 | **+3** |
| Godel | +1 | 0 | 0 | -2 (no verify) | **-1** |

---

### Sprint 5: E009 LLM Review Layer
_Date: 2026-02-26_

| Agent | Stories | Quality | Unblock | Penalties | Total |
|-------|---------|---------|---------|-----------|-------|
| Luna | +9 | +2 | +1 | -2 (gate not wired) | **+10** |
| Kai | +1 (review) | +1 | 0 | 0 | **+2** |
| Godel | +1 | 0 | 0 | -2 (no verify) | **-1** |

---

### Sprint 4: E003 + E004 (API Contracts + Design System)
_Date: 2026-02-25_

| Agent | Stories | Quality | Unblock | Penalties | Total |
|-------|---------|---------|---------|-----------|-------|
| Luna | +7 (E003) | +2 | +1 | 0 | **+10** |
| Nova | +9 (E004) | +2 | +1 | 0 | **+12** |

---

### Sprint 3: E002 Security Scanning
_Date: 2026-02-24_

| Agent | Stories | Quality | Unblock | Penalties | Total |
|-------|---------|---------|---------|-----------|-------|
| Luna | +3 | +1 | +1 | -7 (S010-S014, S017, S018 missing) | **-2** |
| Hawk | +1 (review) | 0 | 0 | -3 (missed gaps) | **-2** |
| Godel | 0 | 0 | 0 | -3 (no AC verify) | **-3** |

**Note:** 7 custom Semgrep rules never implemented. Nobody caught this.

---

### Sprint 2: E010 Baseline Mode
_Date: 2026-02-23_

| Agent | Stories | Quality | Unblock | Penalties | Total |
|-------|---------|---------|---------|-----------|-------|
| Luna | +4 | +2 | +1 | -1 (S085 missing) | **+6** |

---

### Sprint 1: E001 Core Gate System
_Date: 2026-02-22_

| Agent | Stories | Quality | Unblock | Penalties | Total |
|-------|---------|---------|---------|-----------|-------|
| Luna | +8 | +2 | +2 | 0 | **+12** |

**MVP:** Luna (foundation shipped clean)

---

## Gap Accountability

| Missing Item | Story | Owner | Reviewer | Coordinator | Status |
|--------------|-------|-------|----------|-------------|--------|
| Math.random in Auth rule | S010 | Luna | Hawk | Godel | **RESOLVED** by @Latch |
| Raw SQL Unsafe rule | S011 | Luna | Hawk | Godel | **RESOLVED** by @Latch |
| Decode vs Verify Token rule | S012 | Luna | Hawk | Godel | **RESOLVED** by @Latch |
| Commented Guards rule | S013 | Luna | Hawk | Godel | **RESOLVED** by @Latch |
| dangerouslySetInnerHTML rule | S014 | Luna | Hawk | Godel | **RESOLVED** by @Latch |
| Auth Guard Completeness | S017 | Luna | Hawk | Godel | **RESOLVED** by @Latch |
| IDOR Patterns rule | S018 | Luna | Hawk | Godel | **RESOLVED** by @Latch |
| Duplicate Implementation | S044 | — | — | — | **DEFERRED-V2** per spec |
| Suppression Dashboard | S085 | Latch | Hawk | Godel | **RESOLVED** by @Latch |
| LLM gate wiring | — | Godel | — | — | **RESOLVED** |
| Coordination wiring | S096 | Latch | Hawk | Godel | **RESOLVED** by @Latch |

**Pattern:** Coordination failure. No story-level verification. Hawk didn't catch in reviews. Godel didn't track.

---

## Scoring Reference

```
+1 per story shipped
+2 quality (clean, no revisions needed)
+2 unblock (helped teammate)
+1 idea logged
+1 knowledge share

-1 revision required
-3 skipped gate / missed story
-3 coordination failure (Godel)
-2 review miss (Hawk)
```

---

## Notes

**2026-03-01:** First leaderboard update. Retroactively scored all sprints. Multiple gaps discovered:
- 9 stories never implemented
- 2 integration gaps (gates not wired)
- No sprint-level tracking was happening
- Godel takes primary accountability for coordination failure

**Action items:**
1. Implement missing stories before v1.0.0 or document as v1.1
2. Weekly leaderboard updates going forward
3. Story-level AC verification before marking epic complete

**2026-03-01 (later):** @Latch implemented 7 missing Semgrep rules (S010-S014, S017, S018) in `rules/hawky-security.yaml`. Remaining gaps: S044 (duplicate detection), S085 (suppression dashboard), LLM gate wiring, API contract gate.
