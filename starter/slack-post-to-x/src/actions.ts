import type { ActionHandler, WorkflowAuthorizeFn } from "@intx/workflow";

import { requireValidatedPost, validatePost, type ValidatedPost } from "./post";
import {
  PUBLISH_POST_ACTION,
  PUBLISH_POST_EFFECT,
  VALIDATE_POST_ACTION,
} from "./workflow";
import { requirePostReceipt, type Publisher } from "./x-client";

export function createPostActionResolver(opts: {
  publisher: Publisher;
  onValidated?: (post: ValidatedPost) => void;
  onValidationFailed?: (error: unknown) => void | Promise<void>;
}): (ref: string) => ActionHandler {
  const validate: ActionHandler = async (input) => {
    try {
      const post = validatePost(input);
      opts.onValidated?.(post);
      return post;
    } catch (error) {
      await opts.onValidationFailed?.(error);
      throw error;
    }
  };
  const publish: ActionHandler = async (input, effects, signal) => {
    const post = requireValidatedPost(input);
    const receipt = await effects.perform({
      effectId: "publish",
      capability: PUBLISH_POST_EFFECT,
      run: () => opts.publisher.publish(post.text, signal),
    });
    return requirePostReceipt(receipt);
  };

  return (ref) => {
    if (ref === VALIDATE_POST_ACTION) return validate;
    if (ref === PUBLISH_POST_ACTION) return publish;
    throw new Error(`unknown post-to-X action handler: ${ref}`);
  };
}

export function createPostAuthorize(): WorkflowAuthorizeFn {
  return async (resource, action, context) => {
    if (
      resource === `effect:${PUBLISH_POST_EFFECT}` &&
      action === "invoke" &&
      context.stepId === "publish"
    ) {
      const grant = {
        id: "post-to-x-publish",
        resource,
        action,
        effect: "allow" as const,
        origin: "invoker" as const,
        specificity: 100,
      };
      return { effect: "allow", matchingGrants: [grant], resolvedBy: grant };
    }
    return { effect: "deny", matchingGrants: [], resolvedBy: null };
  };
}
