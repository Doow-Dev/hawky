/**
 * Sprint Integration Module
 *
 * Features for integrating Hawky with sprint management workflows.
 * Validates story IDs, manages sprint labels, logs activity, and routes notifications.
 */

export {
  // Types
  type StoryStatus,
  type SprintStory,
  type StoryValidationResult,
  type StoryValidationOptions,
  // Constants
  BRANCH_STORY_ID_PATTERN,
  // Functions
  extractStoryIdFromBranch,
  normalizeStatus,
  parseSprintMd,
  findStoryById,
  validateStoryId,
  formatStoryValidationFinding,
} from './story-id-validation';

export {
  // Types
  type LabelRule,
  type MatchedLabel,
  type AutoLabelResult,
  type AutoLabelOptions,
  // Constants
  DEFAULT_LABEL_RULES,
  // Functions
  fileMatchesRule,
  findTriggerFiles,
  computeAutoLabels,
} from './auto-label';

export {
  // Types
  type OutOfScopeFile,
  type ScopeCreepResult,
  type ScopeCreepOptions,
  // Constants
  ALWAYS_ALLOWED_PATTERNS,
  // Functions
  parseScopeFromSprintMd,
  parseScopeString,
  fileMatchesScope,
  isAlwaysAllowed,
  detectScopeCreep,
  formatScopeCreepWarning,
} from './scope-creep';

export {
  // Types
  type Notification,
  type RoutingRule,
  type NotificationRoutingResult,
  type NotificationRoutingOptions,
  // Constants
  DEFAULT_ROUTING_RULES,
  // Functions
  filesMatchRoutingRule,
  formatNotificationEntry,
  routeNotifications,
} from './notifications-routing';

export {
  // Types
  type PREvent,
  type PREventContext,
  type ActivityEntry,
  type ActivityLoggingResult,
  // Functions
  formatDate,
  normalizeAuthorToAgent,
  extractStoryIdForActivity,
  summarizeChangedFiles,
  buildOpenedEntry,
  buildReviewedEntry,
  buildMergedEntry,
  buildClosedEntry,
  generateActivityEntries,
} from './activity-logging';
