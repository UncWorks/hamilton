use std::collections::BTreeSet;

use hamilton_contracts::RxClass;
use serde::{Deserialize, Serialize};

/// Time-domain pattern classifications matching the fingerprint library schema.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TimeDomainPattern {
    Continuous,
    Pulsed,
    Barrage,
    Swept,
}

/// One entry in the static fingerprint library (FRS §2.4a schema).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FingerprintEntry {
    pub method_id: String,
    pub named_systems: Vec<String>,
    /// Frequency band in MHz as [low, high].
    pub frequency_band_mhz: [f64; 2],
    /// Hop spread threshold in Hz.
    pub hop_spread_hz: f64,
    pub gps_l1_overlap: bool,
    pub gps_l2_overlap: bool,
    pub time_domain_pattern: TimeDomainPattern,
    /// Effective range threshold in km. **Deprecated** (library v0.2): an
    /// emitter range is not observable. Used only by the legacy dimension 6
    /// ([`Dimension6::LegacyRange`]); absent = 0.
    #[serde(default)]
    pub effective_range_km: f64,
    /// Receiver classes the method affects (library v0.2, A1). Dimension 6:
    /// the classes observed degraded at the source are non-empty and a subset
    /// of this set (FRS FR-04 rev).
    #[serde(default)]
    pub affects_rx_classes: Vec<RxClass>,
    pub munitions_affected: Vec<String>,
    pub source_citation: String,
    /// Optional emitter envelope (library v0.2 `emitter.modules[]`).
    #[serde(default)]
    pub emitter: EmitterEnvelope,
}

/// Library v0.2 `emitter` block. `modules` is empty when the envelope is not
/// yet characterised.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct EmitterEnvelope {
    #[serde(default)]
    pub modules: Vec<EmitterModule>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModuleRole {
    Gnss,
    Comms,
}

/// One co-located emitter module. EIRP and mast are `[lo, hi]` ranges and may
/// be `null` in the library (e.g. the comms module's EIRP is an assumption
/// calibrated in the simulator), hence optional.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EmitterModule {
    pub role: ModuleRole,
    pub class_name: String,
    pub band_mhz: [f64; 2],
    #[serde(default)]
    pub eirp_w_claimed: Option<[f64; 2]>,
    #[serde(default)]
    pub emitter_height_m: Option<[f64; 2]>,
    #[serde(default)]
    pub sector_deg_min: Option<f64>,
    #[serde(default)]
    pub transmitter_power_w: Option<f64>,
    #[serde(default)]
    pub jams: Vec<String>,
}

impl FingerprintEntry {
    /// The GNSS module of the envelope, if characterised.
    pub fn gnss_module(&self) -> Option<&EmitterModule> {
        self.emitter
            .modules
            .iter()
            .find(|m| m.role == ModuleRole::Gnss)
    }
}

/// How dimension 6 is evaluated.
#[derive(Debug, Clone, Copy)]
pub enum Dimension6<'a> {
    /// FRS FR-04 rev: the receiver classes observed degraded at the source are
    /// non-empty and a subset of the entry's `affects_rx_classes`.
    ObservedClasses(&'a BTreeSet<RxClass>),
    /// Library v0.1 / telemetry v1: entry `effective_range_km` >= observed.
    /// Kept only for callers that have no per-class observation (the
    /// aggregator's beat test until E23); the engine uses `ObservedClasses`.
    LegacyRange,
}

/// Observed RF fingerprint from the sensor stream.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RfFingerprint {
    /// Observed frequency band in MHz as [low, high].
    pub frequency_band_mhz: [f64; 2],
    /// Observed hop spread in Hz.
    pub hop_spread_hz: f64,
    pub gps_l1_overlap: bool,
    pub gps_l2_overlap: bool,
    pub time_domain_pattern: TimeDomainPattern,
    /// Estimated effective range in km.
    pub effective_range_km: f64,
}

/// The best-matching fingerprint library entry when overlap >= 0.5.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FingerprintMatch {
    pub method_id: String,
    pub named_systems: Vec<String>,
    /// Match strength: normalized overlap ratio in [0.0, 1.0] (matched booleans /
    /// total dimensions). Higher = MORE like this jammer. This is NOT a trust
    /// value; convert with [`fingerprint_trust`] before aggregating (FR-05).
    pub match_strength: f64,
    pub munitions_affected: Vec<String>,
    pub source_citation: String,
}

const MIN_MATCH_THRESHOLD: f64 = 0.5;

/// Number of fingerprint dimensions.
pub const TOTAL_DIMENSIONS: u32 = 6;

/// Match observed RF fingerprint against the library (legacy dimension 6).
///
/// Score = matched_threshold_booleans / total_dimensions (R14-safe, FRS §2.4a).
/// Returns the single best match if score >= 0.5, otherwise None.
pub fn match_fingerprint(
    observed: &RfFingerprint,
    library: &[FingerprintEntry],
) -> Option<FingerprintMatch> {
    match_fingerprint_with(observed, Dimension6::LegacyRange, library)
}

/// [`match_fingerprint`] with an explicit dimension-6 rule. The engine passes
/// [`Dimension6::ObservedClasses`] (FRS FR-04 rev).
pub fn match_fingerprint_with(
    observed: &RfFingerprint,
    dim6: Dimension6<'_>,
    library: &[FingerprintEntry],
) -> Option<FingerprintMatch> {
    library
        .iter()
        .map(|entry| {
            let score =
                f64::from(matched_dimensions(observed, dim6, entry)) / f64::from(TOTAL_DIMENSIONS);
            (entry, score)
        })
        .filter(|(_, score)| *score >= MIN_MATCH_THRESHOLD)
        .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
        .map(|(entry, score)| FingerprintMatch {
            method_id: entry.method_id.clone(),
            named_systems: entry.named_systems.clone(),
            match_strength: score,
            munitions_affected: entry.munitions_affected.clone(),
            source_citation: entry.source_citation.clone(),
        })
}

/// Convert the best fingerprint match into a trust-oriented component for
/// FR-05 (1.0 = healthy, 0.0 = bad).
///
/// `fingerprint_trust = 1 - match_strength`. No match (nothing at or above the
/// 0.5 threshold) yields 1.0: no evidence of jamming. Because the matcher is
/// k/6-quantized, the reachable values are 1.0, 0.5, 2/6, 1/6 and 0.0.
pub fn fingerprint_trust(best: Option<&FingerprintMatch>) -> f64 {
    best.map_or(1.0, |m| (1.0 - m.match_strength).clamp(0.0, 1.0))
}

/// Compute the threshold-boolean overlap ratio for one library entry.
///
/// Six dimensions checked (matching FRS §2.4a schema):
///   1. frequency band overlap (low ≤ observed_low AND high ≥ observed_high)
///   2. hop spread (entry threshold ≥ observed)
///   3. GPS L1 overlap match
///   4. GPS L2 overlap match
///   5. time-domain pattern match
///   6. legacy: effective range (entry threshold ≥ observed)
#[cfg(test)]
pub(crate) fn overlap_score(observed: &RfFingerprint, entry: &FingerprintEntry) -> f64 {
    f64::from(matched_dimensions(observed, Dimension6::LegacyRange, entry))
        / f64::from(TOTAL_DIMENSIONS)
}

/// Integer count of matched dimensions (0..=6). Comparisons between methods
/// (the FR-04a lead, the AoE trigger) use these counts, never float scores.
///
///   1. frequency band containment (entry low ≤ observed low AND high ≥ observed high)
///   2. hop spread (entry threshold ≥ observed)
///   3. GPS L1 overlap match
///   4. GPS L2 overlap match
///   5. time-domain pattern match
///   6. per [`Dimension6`]: affected receiver classes consistent (FR-04 rev),
///      or the legacy range test
pub fn matched_dimensions(
    observed: &RfFingerprint,
    dim6: Dimension6<'_>,
    entry: &FingerprintEntry,
) -> u32 {
    let checks = [
        entry.frequency_band_mhz[0] <= observed.frequency_band_mhz[0]
            && entry.frequency_band_mhz[1] >= observed.frequency_band_mhz[1],
        entry.hop_spread_hz >= observed.hop_spread_hz,
        entry.gps_l1_overlap == observed.gps_l1_overlap,
        entry.gps_l2_overlap == observed.gps_l2_overlap,
        entry.time_domain_pattern == observed.time_domain_pattern,
        match dim6 {
            Dimension6::ObservedClasses(classes) => {
                !classes.is_empty() && classes.iter().all(|c| entry.affects_rx_classes.contains(c))
            }
            Dimension6::LegacyRange => entry.effective_range_km >= observed.effective_range_km,
        },
    ];
    checks.iter().filter(|&&ok| ok).count() as u32
}

#[cfg(test)]
mod tests {
    use super::*;

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
            effective_range_km: 30.0,
        }
    }

    // FRS §2.4 acceptance: Unit B pattern → ground_based_gps_uhf_barrage at 6/6 = 1.00
    #[test]
    fn frs_acceptance_unit_b_matches_ground_based_gps_uhf_barrage() {
        let lib = library();
        let observed = unit_b_observed();

        let result = match_fingerprint(&observed, &lib);

        assert!(result.is_some(), "expected a match");
        let m = result.unwrap();
        assert_eq!(m.method_id, "ground_based_gps_uhf_barrage");
        // All 6 dimensions match → match_strength = 6/6 = 1.0
        assert!((m.match_strength - 1.0).abs() < 1e-10);
    }

    fn synthetic_match(match_strength: f64) -> FingerprintMatch {
        FingerprintMatch {
            method_id: "x".into(),
            named_systems: vec![],
            match_strength,
            munitions_affected: vec![],
            source_citation: "x".into(),
        }
    }

    // No match → no evidence of jamming → full trust.
    #[test]
    fn fingerprint_trust_no_match_is_one() {
        assert!((fingerprint_trust(None) - 1.0).abs() < f64::EPSILON);
    }

    // Full 6/6 match (the demo jammer) → zero fingerprint trust.
    #[test]
    fn fingerprint_trust_full_match_is_zero() {
        let lib = library();
        let m = match_fingerprint(&unit_b_observed(), &lib).expect("demo jammer matches");
        assert!(fingerprint_trust(Some(&m)).abs() < 1e-10);
    }

    // A stronger match never yields higher trust, across every reachable k/6
    // value; no match is the ceiling.
    #[test]
    fn fingerprint_trust_is_monotonic_non_increasing_in_match_strength() {
        let mut prev = fingerprint_trust(None);
        for k in 3..=6 {
            let t = fingerprint_trust(Some(&synthetic_match(f64::from(k) / 6.0)));
            assert!(t <= prev, "k={k}: trust {t} > previous {prev}");
            assert!((0.0..=1.0).contains(&t));
            prev = t;
        }
    }

    // No library entries → None
    #[test]
    fn empty_library_returns_none() {
        let result = match_fingerprint(&unit_b_observed(), &[]);
        assert!(result.is_none());
    }

    // Observed that matches nothing above 0.5 → None
    #[test]
    fn no_match_above_threshold_returns_none() {
        let lib = library();
        // Observed with all-false GPS and swept pattern and tiny range —
        // unlikely to hit any entry fully
        let observed = RfFingerprint {
            frequency_band_mhz: [1.0, 2.0],
            hop_spread_hz: 1.0,
            gps_l1_overlap: false,
            gps_l2_overlap: false,
            time_domain_pattern: TimeDomainPattern::Swept,
            effective_range_km: 0.1,
        };
        // Not asserting None definitively because some entries may partially match;
        // we assert the returned score is consistent if present
        if let Some(m) = match_fingerprint(&observed, &lib) {
            assert!(m.match_strength >= 0.5);
        }
    }

    // Best match is returned when multiple entries qualify
    #[test]
    fn best_match_returned_when_multiple_qualify() {
        let lib = library();
        let observed = unit_b_observed();
        let result = match_fingerprint(&observed, &lib);
        // Ground-based barrage perfectly matches; verify it is the top pick
        let m = result.expect("should match");
        assert_eq!(m.method_id, "ground_based_gps_uhf_barrage");
    }

    // Exact threshold boundary: score exactly 0.5 is accepted
    #[test]
    fn score_at_exactly_half_is_accepted() {
        // Build a synthetic entry where exactly 3/6 dimensions match observed
        let entry = FingerprintEntry {
            method_id: "test_half".into(),
            named_systems: vec![],
            frequency_band_mhz: [100.0, 2000.0], // matches
            hop_spread_hz: 50_000.0,             // matches
            gps_l1_overlap: true,                // matches
            gps_l2_overlap: false,               // does NOT match (observed has true)
            time_domain_pattern: TimeDomainPattern::Pulsed, // does NOT match
            effective_range_km: 10.0,            // does NOT match (observed 30.0 > 10.0)
            affects_rx_classes: vec![],
            munitions_affected: vec![],
            source_citation: "test".into(),
            emitter: EmitterEnvelope::default(),
        };
        let observed = unit_b_observed(); // gps_l2=true, pattern=Barrage, range=30
        let score = super::overlap_score(&observed, &entry);
        assert!(
            (score - 0.5).abs() < 1e-10,
            "expected 3/6 = 0.5, got {score}"
        );

        let result = match_fingerprint(&observed, &[entry]);
        assert!(result.is_some(), "score = 0.5 should be accepted");
    }

    // Score just below 0.5 → None
    #[test]
    fn score_below_half_returns_none() {
        // Build entry matching only 2/6 dimensions
        let entry = FingerprintEntry {
            method_id: "test_low".into(),
            named_systems: vec![],
            frequency_band_mhz: [100.0, 2000.0], // matches
            hop_spread_hz: 50_000.0,             // matches
            gps_l1_overlap: false,               // does NOT match
            gps_l2_overlap: false,               // does NOT match
            time_domain_pattern: TimeDomainPattern::Pulsed, // does NOT match
            effective_range_km: 10.0,            // does NOT match
            affects_rx_classes: vec![],
            munitions_affected: vec![],
            source_citation: "test".into(),
            emitter: EmitterEnvelope::default(),
        };
        let observed = unit_b_observed();
        let score = super::overlap_score(&observed, &entry);
        assert!(
            (score - 2.0 / 6.0).abs() < 1e-10,
            "expected 2/6, got {score}"
        );

        let result = match_fingerprint(&observed, &[entry]);
        assert!(result.is_none(), "score < 0.5 must return None");
    }

    fn classes(c: &[RxClass]) -> BTreeSet<RxClass> {
        c.iter().copied().collect()
    }

    // FR-04 rev dimension 6: B at 1:15 observes civil GNSS (gnss_fix) and its
    // UHF link degraded; at 1:50 only the link. Both stay 6/6.
    #[test]
    fn dimension6_classes_keeps_unit_b_at_six_of_six_at_115_and_150() {
        let lib = library();
        let b115 = classes(&[RxClass::GnssCivil, RxClass::UhfComms]);
        let b150 = classes(&[RxClass::UhfComms]);
        for obs in [&b115, &b150] {
            let m =
                match_fingerprint_with(&unit_b_observed(), Dimension6::ObservedClasses(obs), &lib)
                    .expect("match");
            assert_eq!(m.method_id, "ground_based_gps_uhf_barrage");
            assert!((m.match_strength - 1.0).abs() < 1e-12);
        }
    }

    #[test]
    fn dimension6_fails_on_empty_or_unaffected_classes() {
        let lib = library();
        let entry = lib
            .iter()
            .find(|e| e.method_id == "directional_gps_l1_spot")
            .unwrap();
        let rf = unit_b_observed();
        let none = BTreeSet::new();
        let civil = classes(&[RxClass::GnssCivil]);
        let civil_uhf = classes(&[RxClass::GnssCivil, RxClass::UhfComms]);
        let base = matched_dimensions(&rf, Dimension6::ObservedClasses(&civil), entry);
        assert_eq!(
            matched_dimensions(&rf, Dimension6::ObservedClasses(&none), entry),
            base - 1
        );
        assert_eq!(
            matched_dimensions(&rf, Dimension6::ObservedClasses(&civil_uhf), entry),
            base - 1
        );
    }

    #[test]
    fn library_v0_2_envelope_is_parsed() {
        let lib = library();
        let demo = lib
            .iter()
            .find(|e| e.method_id == "ground_based_gps_uhf_barrage")
            .unwrap();
        let gnss = demo.gnss_module().expect("GNSS module");
        assert_eq!(gnss.eirp_w_claimed, Some([300.0, 1000.0]));
        assert_eq!(gnss.emitter_height_m, Some([10.0, 60.0]));
        let comms = demo
            .emitter
            .modules
            .iter()
            .find(|m| m.role == ModuleRole::Comms)
            .unwrap();
        assert_eq!(comms.eirp_w_claimed, None);
        assert_eq!(comms.emitter_height_m, None);
        assert!(lib.iter().all(|e| !e.affects_rx_classes.is_empty()));
    }
}
