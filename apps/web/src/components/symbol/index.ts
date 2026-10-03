// Production track symbology (Storybook Decisions/Track Symbology).
export { describeTrackSymbol, gaugeOffsetPx, isDetail, type SymbolDescription, type SymbolLayout, type SymbolOptions, type SymbolText, type SymbolTrack } from './describe';
export { SymbolGroup, SymbolPrims, TrackSymbol, TrackSymbolG, placeSymbol, type TrackSymbolProps } from './TrackSymbol';
export { SYMBOL_COLOR_LITERALS, resolveSymbolColor, trackSymbolDataUrl, trackSymbolSvg, type SymbolImage } from './svg-string';
export {
  RatingExplanation,
  TRIGGER_CSS,
  TrackSymbolWithTooltip,
  evidenceFor,
  explainRating,
  tooltipSurface,
  useAnchoredTips,
  useHoverTip,
  type EvidenceContext,
  type ExplanationProps,
  type TrackSymbolWithTooltipProps,
} from './RatingTooltip';
export { DECLUTTER_MIN_COUNT, DECLUTTER_RADIUS_S, DeclutterStack, OverflowCount, STACK_MAX_SHOWN, StackBracket, stackGeometry, stackOrder, type StackGeometry } from './Declutter';
export { LABEL_MIN_BOX_PX, LOD_BELOW_PX, TA_RADAR_SCALE } from './geometry';
export { toCotType, toSidc2525C, toSidc2525E } from '@/lib/track-sidc';
