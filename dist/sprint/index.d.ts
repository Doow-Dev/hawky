/**
 * Sprint Integration Module
 *
 * Features for integrating Hawky with sprint management workflows.
 * Validates story IDs, manages sprint labels, logs activity, and routes notifications.
 */
export { type StoryStatus, type SprintStory, type StoryValidationResult, type StoryValidationOptions, BRANCH_STORY_ID_PATTERN, extractStoryIdFromBranch, normalizeStatus, parseSprintMd, findStoryById, validateStoryId, formatStoryValidationFinding, } from './story-id-validation';
export { type LabelRule, type MatchedLabel, type AutoLabelResult, type AutoLabelOptions, DEFAULT_LABEL_RULES, fileMatchesRule, findTriggerFiles, computeAutoLabels, } from './auto-label';
export { type OutOfScopeFile, type ScopeCreepResult, type ScopeCreepOptions, ALWAYS_ALLOWED_PATTERNS, parseScopeFromSprintMd, parseScopeString, fileMatchesScope, isAlwaysAllowed, detectScopeCreep, formatScopeCreepWarning, } from './scope-creep';
export { type Notification, type RoutingRule, type NotificationRoutingResult, type NotificationRoutingOptions, DEFAULT_ROUTING_RULES, filesMatchRoutingRule, formatNotificationEntry, routeNotifications, } from './notifications-routing';
export { type PREvent, type PREventContext, type ActivityEntry, type ActivityLoggingResult, formatDate, normalizeAuthorToAgent, extractStoryIdForActivity, summarizeChangedFiles, buildOpenedEntry, buildReviewedEntry, buildMergedEntry, buildClosedEntry, generateActivityEntries, } from './activity-logging';
export { type SprintLabel, type SprintStatusResult, type SprintStatusOpenOptions, type SprintStatusMergeOptions, type SprintStatusOctokitLike, SPRINT_LABEL_REVIEW, SPRINT_LABEL_DONE, SPRINT_LABEL_BLOCKED, extractStoryId, buildOpenPRComment, buildMergePRComment, applyPROpenedStatus, applyPRMergedStatus, applyOpenedStatus, applyMergedStatus, } from './pr-status';
export { type ReviewEvent, type ProtocolSequenceResult, type ProtocolSequenceOptions, type ProtocolOctokitLike, DEFAULT_HAWK_LOGINS, DEFAULT_PM_LOGINS, DEFAULT_LGTM_KEYWORDS, DEFAULT_CONFIRM_KEYWORDS, isLgtmComment, isPMConfirmation, findHawkApproval, findPMConfirmation, checkProtocolSequence, fetchAndCheckProtocol, formatProtocolSequenceInfo, } from './protocol-sequence';
//# sourceMappingURL=index.d.ts.map