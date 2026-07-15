import { type as arkType, type Type } from "arktype";

import type { XAPIRequest, XQueryValue } from "../client";

const USER_FIELDS = [
  "affiliation",
  "confirmed_email",
  "connection_status",
  "created_at",
  "description",
  "entities",
  "id",
  "is_identity_verified",
  "location",
  "most_recent_tweet_id",
  "name",
  "parody",
  "pinned_tweet_id",
  "profile_banner_url",
  "profile_image_url",
  "protected",
  "public_metrics",
  "receives_your_dm",
  "subscription",
  "subscription_type",
  "url",
  "username",
  "verified",
  "verified_followers_count",
  "verified_type",
  "withheld",
] as const;

const TWEET_FIELDS = [
  "article",
  "attachments",
  "author_id",
  "card_uri",
  "community_id",
  "context_annotations",
  "conversation_id",
  "created_at",
  "display_text_range",
  "edit_controls",
  "edit_history_tweet_ids",
  "entities",
  "geo",
  "id",
  "in_reply_to_user_id",
  "lang",
  "matched_media_notes",
  "media_metadata",
  "non_public_metrics",
  "note_request_suggestions",
  "note_tweet",
  "organic_metrics",
  "paid_partnership",
  "possibly_sensitive",
  "promoted_metrics",
  "public_metrics",
  "referenced_tweets",
  "reply_settings",
  "scopes",
  "source",
  "suggested_source_links",
  "suggested_source_links_with_counts",
  "text",
  "withheld",
] as const;

const USER_EXPANSIONS = [
  "affiliation.user_id",
  "most_recent_tweet_id",
  "pinned_tweet_id",
] as const;

const TWEET_EXPANSIONS = [
  "article.cover_media",
  "article.media_entities",
  "attachments.media_keys",
  "attachments.media_source_tweet",
  "attachments.poll_ids",
  "author_id",
  "edit_history_tweet_ids",
  "entities.mentions.username",
  "entities.note.mentions.username",
  "geo.place_id",
  "in_reply_to_user_id",
  "referenced_tweets.id",
  "referenced_tweets.id.attachments.media_keys",
  "referenced_tweets.id.author_id",
] as const;

const MEDIA_FIELDS = [
  "alt_text",
  "duration_ms",
  "height",
  "media_key",
  "non_public_metrics",
  "organic_metrics",
  "preview_image_url",
  "promoted_metrics",
  "public_metrics",
  "type",
  "url",
  "variants",
  "width",
] as const;

const POLL_FIELDS = [
  "duration_minutes",
  "end_datetime",
  "id",
  "options",
  "voting_status",
] as const;

const PLACE_FIELDS = [
  "contained_within",
  "country",
  "country_code",
  "full_name",
  "geo",
  "id",
  "name",
  "place_type",
] as const;

const UserId = arkType("string")
  .matching(/^[0-9]{1,19}$/)
  .describe("X User ID represented as a decimal string");
const AuthenticatedUserId = arkType("string")
  .atLeastLength(1)
  .describe("ID of the User authenticated by X_ACCESS_TOKEN");
const TweetId = arkType("string")
  .matching(/^[0-9]{1,19}$/)
  .describe("X Post ID represented as a decimal string");
const Username = arkType("string")
  .matching(/^[A-Za-z0-9_]{1,15}$/)
  .describe("X username without the @ prefix");
const UserIds = UserId.array().atLeastLength(1).atMostLength(100);
const Usernames = Username.array().atLeastLength(1).atMostLength(100);
const UserFields = arkType
  .enumerated(...USER_FIELDS)
  .array()
  .atLeastLength(1);
const TweetFields = arkType
  .enumerated(...TWEET_FIELDS)
  .array()
  .atLeastLength(1);
const UserExpansions = arkType
  .enumerated(...USER_EXPANSIONS)
  .array()
  .atLeastLength(1);
const TweetExpansions = arkType
  .enumerated(...TWEET_EXPANSIONS)
  .array()
  .atLeastLength(1);
const MediaFields = arkType
  .enumerated(...MEDIA_FIELDS)
  .array()
  .atLeastLength(1);
const PollFields = arkType
  .enumerated(...POLL_FIELDS)
  .array()
  .atLeastLength(1);
const PlaceFields = arkType
  .enumerated(...PLACE_FIELDS)
  .array()
  .atLeastLength(1);
const PostExclusions = arkType
  .enumerated("replies", "retweets")
  .array()
  .atLeastLength(1);
const TimelineExclusions = arkType.enumerated("replies", "retweets").array();
const DateTime = arkType("string")
  .matching(
    /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?Z$/,
  )
  .describe("UTC timestamp in YYYY-MM-DDTHH:mm:ssZ format");
const PaginationToken = arkType("string").atLeastLength(1);
const LongPaginationToken = PaginationToken.atMostLength(19);
const Base32PaginationToken = arkType("string").atLeastLength(16);
const MaxResults5To100 = arkType("number.integer").atLeast(5).atMost(100);
const MaxResults1To100 = arkType("number.integer").atLeast(1).atMost(100);
const MaxResults1To1000 = arkType("number.integer").atLeast(1).atMost(1000);

const USER_PROJECTION = {
  "user.fields?": UserFields,
  "expansions?": UserExpansions,
  "tweet.fields?": TweetFields,
} as const;

const TWEET_PROJECTION = {
  "tweet.fields?": TweetFields,
  "expansions?": TweetExpansions,
  "media.fields?": MediaFields,
  "poll.fields?": PollFields,
  "user.fields?": UserFields,
  "place.fields?": PlaceFields,
} as const;

const EmptyUserProjectionInput =
  arkType(USER_PROJECTION).onUndeclaredKey("reject");
const UserByIdInput = arkType({
  id: UserId,
  ...USER_PROJECTION,
}).onUndeclaredKey("reject");
const UsersByIdsInput = arkType({
  ids: UserIds,
  ...USER_PROJECTION,
}).onUndeclaredKey("reject");
const UserByUsernameInput = arkType({
  username: Username,
  ...USER_PROJECTION,
}).onUndeclaredKey("reject");
const UsersByUsernamesInput = arkType({
  usernames: Usernames,
  ...USER_PROJECTION,
}).onUndeclaredKey("reject");
const UserPostsInput = arkType({
  id: UserId,
  "since_id?": TweetId,
  "until_id?": TweetId,
  "max_results?": MaxResults5To100,
  "pagination_token?": PaginationToken,
  "exclude?": PostExclusions,
  "start_time?": DateTime,
  "end_time?": DateTime,
  ...TWEET_PROJECTION,
}).onUndeclaredKey("reject");
const UserMentionsInput = arkType({
  id: UserId,
  "since_id?": TweetId,
  "until_id?": TweetId,
  "max_results?": MaxResults5To100,
  "pagination_token?": PaginationToken,
  "start_time?": DateTime,
  "end_time?": DateTime,
  ...TWEET_PROJECTION,
}).onUndeclaredKey("reject");
const UserTimelineInput = arkType({
  id: AuthenticatedUserId,
  "since_id?": TweetId,
  "until_id?": TweetId,
  "max_results?": MaxResults1To100,
  "pagination_token?": PaginationToken,
  "exclude?": TimelineExclusions,
  "start_time?": DateTime,
  "end_time?": DateTime,
  ...TWEET_PROJECTION,
}).onUndeclaredKey("reject");
const UserConnectionsInput = arkType({
  id: UserId,
  "max_results?": MaxResults1To1000,
  "pagination_token?": Base32PaginationToken,
  ...USER_PROJECTION,
}).onUndeclaredKey("reject");
const UserLikedPostsInput = arkType({
  id: UserId,
  "max_results?": MaxResults5To100,
  "pagination_token?": PaginationToken,
  ...TWEET_PROJECTION,
}).onUndeclaredKey("reject");
const RepostsOfMeInput = arkType({
  "max_results?": MaxResults1To100,
  "pagination_token?": PaginationToken,
  ...TWEET_PROJECTION,
}).onUndeclaredKey("reject");
const UserBlockingInput = arkType({
  id: AuthenticatedUserId,
  "max_results?": MaxResults1To1000,
  "pagination_token?": Base32PaginationToken,
  ...USER_PROJECTION,
}).onUndeclaredKey("reject");
const UserMutingInput = arkType({
  id: AuthenticatedUserId,
  "max_results?": MaxResults1To1000,
  "pagination_token?": LongPaginationToken,
  ...USER_PROJECTION,
}).onUndeclaredKey("reject");
const UserAffiliatesInput = arkType({
  id: UserId,
  "max_results?": MaxResults1To1000,
  "pagination_token?": LongPaginationToken,
  ...USER_PROJECTION,
}).onUndeclaredKey("reject");
const FollowOrMuteInput = arkType({
  id: AuthenticatedUserId,
  target_user_id: UserId,
}).onUndeclaredKey("reject");
const UnfollowOrUnmuteInput = arkType({
  source_user_id: AuthenticatedUserId,
  target_user_id: UserId,
}).onUndeclaredKey("reject");
const LikeOrRepostInput = arkType({
  id: AuthenticatedUserId,
  tweet_id: TweetId,
}).onUndeclaredKey("reject");
const UnlikeInput = arkType({
  id: AuthenticatedUserId,
  tweet_id: TweetId,
}).onUndeclaredKey("reject");
const UnrepostInput = arkType({
  id: AuthenticatedUserId,
  source_tweet_id: TweetId,
}).onUndeclaredKey("reject");

export type XUserOperation<Name extends string = string> = {
  readonly name: Name;
  readonly description: string;
  readonly method: XAPIRequest["method"];
  readonly path: string;
  readonly pathParams: readonly string[];
  readonly queryParams: readonly string[];
  readonly bodyParams: readonly string[];
  readonly input: Type;
  readonly inputSchema: Record<string, unknown>;
};

type OperationConfig<Name extends string> = Omit<
  XUserOperation<Name>,
  "inputSchema"
>;

export const UNIQUE_ARRAY_ARGUMENTS = new Set([
  "exclude",
  "expansions",
  "media.fields",
  "place.fields",
  "poll.fields",
  "tweet.fields",
  "user.fields",
]);

export const DATE_TIME_ARGUMENTS = new Set(["start_time", "end_time"]);

function decorateInputSchema(input: Type): Record<string, unknown> {
  const schema = structuredClone(input.toJsonSchema()) as Record<
    string,
    unknown
  >;
  const properties = schema["properties"] as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (properties === undefined) return schema;
  for (const name of UNIQUE_ARRAY_ARGUMENTS) {
    const property = properties[name];
    if (property?.["type"] === "array") property["uniqueItems"] = true;
  }
  for (const name of DATE_TIME_ARGUMENTS) {
    const property = properties[name];
    if (property?.["type"] === "string") property["format"] = "date-time";
  }
  return schema;
}

function defineOperation<const Name extends string>(
  config: OperationConfig<Name>,
): XUserOperation<Name> {
  return Object.freeze({
    ...config,
    inputSchema: decorateInputSchema(config.input),
  });
}

const userProjectionParams = [
  "user.fields",
  "expansions",
  "tweet.fields",
] as const;
const tweetProjectionParams = [
  "tweet.fields",
  "expansions",
  "media.fields",
  "poll.fields",
  "user.fields",
  "place.fields",
] as const;

export const USER_OPERATIONS = [
  defineOperation({
    name: "getUsersMe",
    description: "Get the X User authenticated by X_ACCESS_TOKEN.",
    method: "GET",
    path: "/2/users/me",
    pathParams: [],
    queryParams: userProjectionParams,
    bodyParams: [],
    input: EmptyUserProjectionInput,
  }),
  defineOperation({
    name: "getUsersById",
    description: "Get one X User by User ID.",
    method: "GET",
    path: "/2/users/{id}",
    pathParams: ["id"],
    queryParams: userProjectionParams,
    bodyParams: [],
    input: UserByIdInput,
  }),
  defineOperation({
    name: "getUsersByIds",
    description: "Get 1 to 100 X Users by User IDs.",
    method: "GET",
    path: "/2/users",
    pathParams: [],
    queryParams: ["ids", ...userProjectionParams],
    bodyParams: [],
    input: UsersByIdsInput,
  }),
  defineOperation({
    name: "getUsersByUsername",
    description: "Get one X User by username without the @ prefix.",
    method: "GET",
    path: "/2/users/by/username/{username}",
    pathParams: ["username"],
    queryParams: userProjectionParams,
    bodyParams: [],
    input: UserByUsernameInput,
  }),
  defineOperation({
    name: "getUsersByUsernames",
    description: "Get 1 to 100 X Users by usernames without @ prefixes.",
    method: "GET",
    path: "/2/users/by",
    pathParams: [],
    queryParams: ["usernames", ...userProjectionParams],
    bodyParams: [],
    input: UsersByUsernamesInput,
  }),
  defineOperation({
    name: "getUsersPosts",
    description: "Get Posts authored by a specific X User.",
    method: "GET",
    path: "/2/users/{id}/tweets",
    pathParams: ["id"],
    queryParams: [
      "since_id",
      "until_id",
      "max_results",
      "pagination_token",
      "exclude",
      "start_time",
      "end_time",
      ...tweetProjectionParams,
    ],
    bodyParams: [],
    input: UserPostsInput,
  }),
  defineOperation({
    name: "getUsersMentions",
    description: "Get Posts that mention a specific X User.",
    method: "GET",
    path: "/2/users/{id}/mentions",
    pathParams: ["id"],
    queryParams: [
      "since_id",
      "until_id",
      "max_results",
      "pagination_token",
      "start_time",
      "end_time",
      ...tweetProjectionParams,
    ],
    bodyParams: [],
    input: UserMentionsInput,
  }),
  defineOperation({
    name: "getUsersTimeline",
    description:
      "Get the reverse-chronological timeline for the authenticated X User; id must match the token owner.",
    method: "GET",
    path: "/2/users/{id}/timelines/reverse_chronological",
    pathParams: ["id"],
    queryParams: [
      "since_id",
      "until_id",
      "max_results",
      "pagination_token",
      "exclude",
      "start_time",
      "end_time",
      ...tweetProjectionParams,
    ],
    bodyParams: [],
    input: UserTimelineInput,
  }),
  defineOperation({
    name: "getUsersFollowers",
    description: "Get Users who follow a specific X User.",
    method: "GET",
    path: "/2/users/{id}/followers",
    pathParams: ["id"],
    queryParams: ["max_results", "pagination_token", ...userProjectionParams],
    bodyParams: [],
    input: UserConnectionsInput,
  }),
  defineOperation({
    name: "getUsersFollowing",
    description: "Get Users followed by a specific X User.",
    method: "GET",
    path: "/2/users/{id}/following",
    pathParams: ["id"],
    queryParams: ["max_results", "pagination_token", ...userProjectionParams],
    bodyParams: [],
    input: UserConnectionsInput,
  }),
  defineOperation({
    name: "getUsersLikedPosts",
    description: "Get Posts liked by a specific X User.",
    method: "GET",
    path: "/2/users/{id}/liked_tweets",
    pathParams: ["id"],
    queryParams: ["max_results", "pagination_token", ...tweetProjectionParams],
    bodyParams: [],
    input: UserLikedPostsInput,
  }),
  defineOperation({
    name: "getUsersRepostsOfMe",
    description: "Get recent reposts of the authenticated X User's Posts.",
    method: "GET",
    path: "/2/users/reposts_of_me",
    pathParams: [],
    queryParams: ["max_results", "pagination_token", ...tweetProjectionParams],
    bodyParams: [],
    input: RepostsOfMeInput,
  }),
  defineOperation({
    name: "getUsersBlocking",
    description:
      "Get Users blocked by the authenticated X User; id must match the token owner.",
    method: "GET",
    path: "/2/users/{id}/blocking",
    pathParams: ["id"],
    queryParams: ["max_results", "pagination_token", ...userProjectionParams],
    bodyParams: [],
    input: UserBlockingInput,
  }),
  defineOperation({
    name: "getUsersMuting",
    description:
      "Get Users muted by the authenticated X User; id must match the token owner.",
    method: "GET",
    path: "/2/users/{id}/muting",
    pathParams: ["id"],
    queryParams: ["max_results", "pagination_token", ...userProjectionParams],
    bodyParams: [],
    input: UserMutingInput,
  }),
  defineOperation({
    name: "getUsersAffiliates",
    description: "Get Users affiliated with an organization X User.",
    method: "GET",
    path: "/2/users/{id}/affiliates",
    pathParams: ["id"],
    queryParams: ["max_results", "pagination_token", ...userProjectionParams],
    bodyParams: [],
    input: UserAffiliatesInput,
  }),
  defineOperation({
    name: "followUser",
    description:
      "Follow a target X User. This mutates the authenticated account; id must match the token owner.",
    method: "POST",
    path: "/2/users/{id}/following",
    pathParams: ["id"],
    queryParams: [],
    bodyParams: ["target_user_id"],
    input: FollowOrMuteInput,
  }),
  defineOperation({
    name: "unfollowUser",
    description:
      "Unfollow a target X User. This mutates the authenticated account; source_user_id must match the token owner.",
    method: "DELETE",
    path: "/2/users/{source_user_id}/following/{target_user_id}",
    pathParams: ["source_user_id", "target_user_id"],
    queryParams: [],
    bodyParams: [],
    input: UnfollowOrUnmuteInput,
  }),
  defineOperation({
    name: "muteUser",
    description:
      "Mute a target X User. This mutates the authenticated account; id must match the token owner.",
    method: "POST",
    path: "/2/users/{id}/muting",
    pathParams: ["id"],
    queryParams: [],
    bodyParams: ["target_user_id"],
    input: FollowOrMuteInput,
  }),
  defineOperation({
    name: "unmuteUser",
    description:
      "Unmute a target X User. This mutates the authenticated account; source_user_id must match the token owner.",
    method: "DELETE",
    path: "/2/users/{source_user_id}/muting/{target_user_id}",
    pathParams: ["source_user_id", "target_user_id"],
    queryParams: [],
    bodyParams: [],
    input: UnfollowOrUnmuteInput,
  }),
  defineOperation({
    name: "likePost",
    description:
      "Like a Post. This mutates the authenticated account; id must match the token owner.",
    method: "POST",
    path: "/2/users/{id}/likes",
    pathParams: ["id"],
    queryParams: [],
    bodyParams: ["tweet_id"],
    input: LikeOrRepostInput,
  }),
  defineOperation({
    name: "unlikePost",
    description:
      "Unlike a Post. This mutates the authenticated account; id must match the token owner.",
    method: "DELETE",
    path: "/2/users/{id}/likes/{tweet_id}",
    pathParams: ["id", "tweet_id"],
    queryParams: [],
    bodyParams: [],
    input: UnlikeInput,
  }),
  defineOperation({
    name: "repostPost",
    description:
      "Repost a Post. This mutates the authenticated account; id must match the token owner.",
    method: "POST",
    path: "/2/users/{id}/retweets",
    pathParams: ["id"],
    queryParams: [],
    bodyParams: ["tweet_id"],
    input: LikeOrRepostInput,
  }),
  defineOperation({
    name: "unrepostPost",
    description:
      "Remove a repost. This mutates the authenticated account; id must match the token owner.",
    method: "DELETE",
    path: "/2/users/{id}/retweets/{source_tweet_id}",
    pathParams: ["id", "source_tweet_id"],
    queryParams: [],
    bodyParams: [],
    input: UnrepostInput,
  }),
] as const;

export type XUserToolName = (typeof USER_OPERATIONS)[number]["name"];

export const USER_TOOL_NAMES: readonly XUserToolName[] = USER_OPERATIONS.map(
  (operation) => operation.name,
);

export const USER_OPERATIONS_BY_NAME = new Map(
  USER_OPERATIONS.map((operation) => [operation.name, operation]),
);

export function buildUserRequest(
  operation: XUserOperation,
  args: Record<string, unknown>,
): XAPIRequest {
  let path = operation.path;
  for (const name of operation.pathParams) {
    path = path.replace(`{${name}}`, encodeURIComponent(String(args[name])));
  }

  const query: Record<string, XQueryValue> = {};
  for (const name of operation.queryParams) {
    const value = args[name];
    if (value !== undefined) query[name] = value as XQueryValue;
  }

  const body: Record<string, unknown> = {};
  for (const name of operation.bodyParams) body[name] = args[name];

  return {
    method: operation.method,
    path,
    ...(Object.keys(query).length === 0 ? {} : { query }),
    ...(Object.keys(body).length === 0 ? {} : { body }),
  };
}
