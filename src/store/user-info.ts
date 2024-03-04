import { BehaviorSubject } from "rxjs";
import { LlmUserInfo, Store } from "../types";
import { getUserName } from "../utils";

/**
 * Store information about current user
 * May also be used to store memory across chats in the future
 */
const userInfoStore: Store<LlmUserInfo> = {
  subject: new BehaviorSubject<LlmUserInfo>({ name: "<Anonymous>" }),
  status: {
    ready: new BehaviorSubject(false),
  },
  selfSubscription: {},
  init: async () => {
    const name = await getUserName();
    userInfoStore.subject.next({
      ...userInfoStore.subject.getValue(),
      name,
    });
    userInfoStore.status.ready.next(true);
  },
  [Symbol.asyncDispose]: async () => {
    // Do nothing
  },
};

export { userInfoStore };
