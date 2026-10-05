use crate::fingerprint::{
    matched_dimensions, Dimension6, FingerprintEntry, RfFingerprint, TOTAL_DIMENSIONS,
};
use serde::{Deserialize, Serialize};

/// One entry in the ranked candidate list (FR-04a).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RankedCandidate {
    pub method_id: String,
    pub named_systems: Vec<String>,
    /// Match strength: normalized overlap ratio in [0.0, 1.0]. Higher = MORE
    /// like this jammer. Published as-is on the FR-04a candidates topic; it is
    /// not a trust value (see `fingerprint::fingerprint_trust`).
    pub score: f64,
    /// Integer matched-dimension count (`score` = `matched` / 6). The FR-04a
    /// lead and the AoE trigger compare these, never float scores.
    pub matched: u32,
    pub munitions_affected: Vec<String>,
    pub source_citation: String,
}

/// Lead of the top candidate over the second, in whole dimensions
/// (`top.matched - second.matched`; the second is 0 when padded).
pub fn lead_dimensions(ranked: &[RankedCandidate]) -> u32 {
    let top = ranked.first().map_or(0, |c| c.matched);
    let second = ranked.get(1).map_or(0, |c| c.matched);
    top.saturating_sub(second)
}

/// Produce the top-3 ranked candidates for an observed RF fingerprint, with
/// dimension 6 per [`Dimension6`] (FRS FR-04 rev).
///
/// Score = matched_threshold_booleans / total_dimensions (R14-safe, FRS §2.4a).
/// Result is always exactly 3 entries, padded with score-0 sentinel entries
/// when fewer than 3 library entries produce non-zero scores (System Design §5.2).
pub fn rank_candidates_with(
    observed: &RfFingerprint,
    dim6: Dimension6<'_>,
    library: &[FingerprintEntry],
) -> Vec<RankedCandidate> {
    let mut scored: Vec<RankedCandidate> = library
        .iter()
        .map(|entry| {
            let matched = matched_dimensions(observed, dim6, entry);
            RankedCandidate {
                method_id: entry.method_id.clone(),
                named_systems: entry.named_systems.clone(),
                score: f64::from(matched) / f64::from(TOTAL_DIMENSIONS),
                matched,
                munitions_affected: entry.munitions_affected.clone(),
                source_citation: entry.source_citation.clone(),
            }
        })
        .collect();

    // Sort descending by matched count; break ties alphabetically for determinism
    scored.sort_by(|a, b| {
        b.matched
            .cmp(&a.matched)
            .then_with(|| a.method_id.cmp(&b.method_id))
    });

    scored.truncate(3);

    // Pad to exactly 3 with score-0 sentinels
    while scored.len() < 3 {
        scored.push(RankedCandidate {
            method_id: String::new(),
            named_systems: vec![],
            score: 0.0,
            matched: 0,
            munitions_affected: vec![],
            source_citation: String::new(),
        });
    }

    scored
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fingerprint::TimeDomainPattern;
    use hamilton_contracts::RxClass;
    use std::collections::BTreeSet;

    fn library() -> Vec<FingerprintEntry> {
        let raw = include_str!("../../../../../assets/fingerprints/library.json");
        let parsed: serde_json::Value = serde_json::from_str(raw).unwrap();
        parsed["entries"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| serde_json::from_value(e.clone()).unwrap())
            .collect()
    }

    fn unit_b_observed() -> RfFingerprint {
        RfFingerprint {
            frequency_band_mhz: [100.0, 2000.0],
            hop_spread_hz: 50_000.0,
            gps_l1_overlap: true,
            gps_l2_overlap: true,
            time_domain_pattern: TimeDomainPattern::Barrage,
        }
    }

    /// B at 1:15: civil GNSS and the UHF link degraded.
    fn rank_candidates(
        observed: &RfFingerprint,
        library: &[FingerprintEntry],
    ) -> Vec<RankedCandidate> {
        let b115: BTreeSet<RxClass> = [RxClass::GnssCivil, RxClass::UhfComms].into();
        rank_candidates_with(observed, Dimension6::ObservedClasses(&b115), library)
    }

    // Result is always exactly 3 entries
    #[test]
    fn always_returns_exactly_three_candidates() {
        let lib = library();
        let candidates = rank_candidates(&unit_b_observed(), &lib);
        assert_eq!(
            candidates.len(),
            3,
            "must always return exactly 3 candidates"
        );
    }

    // Candidates are in descending score order
    #[test]
    fn candidates_are_sorted_descending() {
        let lib = library();
        let candidates = rank_candidates(&unit_b_observed(), &lib);
        for w in candidates.windows(2) {
            assert!(
                w[0].score >= w[1].score,
                "expected descending: {} >= {}",
                w[0].score,
                w[1].score
            );
        }
    }

    // Top candidate for Unit B is the ground-based barrage entry
    #[test]
    fn top_candidate_is_ground_based_barrage_for_unit_b() {
        let lib = library();
        let candidates = rank_candidates(&unit_b_observed(), &lib);
        assert_eq!(
            candidates[0].method_id, "ground_based_gps_uhf_barrage",
            "expected barrage to rank first"
        );
        assert!(candidates[0].score > 0.0);
    }

    // Empty library → all 3 entries are padding with score 0.0
    #[test]
    fn empty_library_returns_three_padding_entries() {
        let candidates = rank_candidates(&unit_b_observed(), &[]);
        assert_eq!(candidates.len(), 3);
        for c in &candidates {
            assert!(
                (c.score - 0.0).abs() < f64::EPSILON,
                "padding score must be 0"
            );
            assert!(c.method_id.is_empty(), "padding method_id must be empty");
        }
    }

    // When only one library entry is provided, two padding entries are appended
    #[test]
    fn single_library_entry_pads_to_three() {
        let single = vec![FingerprintEntry {
            method_id: "only_one".into(),
            named_systems: vec!["SystemX".into()],
            frequency_band_mhz: [100.0, 2000.0],
            hop_spread_hz: 50_000.0,
            gps_l1_overlap: true,
            gps_l2_overlap: true,
            time_domain_pattern: TimeDomainPattern::Barrage,
            affects_rx_classes: vec![RxClass::GnssCivil, RxClass::UhfComms],
            munitions_affected: vec!["Excalibur".into()],
            source_citation: "test".into(),
            emitter: Default::default(),
        }];
        let candidates = rank_candidates(&unit_b_observed(), &single);
        assert_eq!(candidates.len(), 3);
        assert_eq!(candidates[0].method_id, "only_one");
        assert!(candidates[0].score > 0.0);
        // Remaining two are padding
        assert!((candidates[1].score - 0.0).abs() < f64::EPSILON);
        assert!((candidates[2].score - 0.0).abs() < f64::EPSILON);
    }

    // FR-04a re-pin under the FR-04 rev dimension 6 (affected receiver
    // classes): B observes {civil GNSS, UHF link} degraded at 1:15 and {UHF
    // link} at 1:50 (its GNSS fix recovers after the move). Both give
    // 6/6, 4/6, 1/6: pulsed_uhf_wide gains dimension 6 (it affects every
    // class), cellular_uhf_barrage (FPV only) does not. The lead is 2 whole
    // dimensions, compared as integers.
    #[test]
    fn demo_top_three_repinned_under_dimension6_classes() {
        let lib = library();
        let b115: BTreeSet<RxClass> = [RxClass::GnssCivil, RxClass::UhfComms].into();
        let b150: BTreeSet<RxClass> = [RxClass::UhfComms].into();
        for obs in [&b115, &b150] {
            let c =
                rank_candidates_with(&unit_b_observed(), Dimension6::ObservedClasses(obs), &lib);
            let got: Vec<(&str, u32)> = c
                .iter()
                .map(|c| (c.method_id.as_str(), c.matched))
                .collect();
            assert_eq!(
                got,
                [
                    ("ground_based_gps_uhf_barrage", 6),
                    ("pulsed_uhf_wide", 4),
                    ("cellular_uhf_barrage", 1),
                ]
            );
            assert_eq!(lead_dimensions(&c), 2);
            assert!((c[1].score - 4.0 / 6.0).abs() < 1e-12);
        }
    }

    // All scores in [0.0, 1.0]
    #[test]
    fn all_scores_are_in_valid_range() {
        let lib = library();
        let candidates = rank_candidates(&unit_b_observed(), &lib);
        for c in &candidates {
            assert!(
                c.score >= 0.0 && c.score <= 1.0,
                "score {} out of range",
                c.score
            );
        }
    }

    // Non-zero scores exist when library has matching entries
    #[test]
    fn at_least_one_nonzero_score_with_real_library() {
        let lib = library();
        let candidates = rank_candidates(&unit_b_observed(), &lib);
        let nonzero = candidates.iter().filter(|c| c.score > 0.0).count();
        assert!(
            nonzero >= 1,
            "expected at least one non-zero score from the library"
        );
    }

    // Determinism: same input → same output on repeated calls
    #[test]
    fn rank_candidates_is_deterministic() {
        let lib = library();
        let observed = unit_b_observed();
        let first = rank_candidates(&observed, &lib);
        let second = rank_candidates(&observed, &lib);
        assert_eq!(first.len(), second.len());
        for (a, b) in first.iter().zip(second.iter()) {
            assert_eq!(a.method_id, b.method_id);
            assert!((a.score - b.score).abs() < f64::EPSILON);
        }
    }
}
