import { runAppleScript } from "@raycast/utils";
import { LlmUserInfo, Store } from "./types";
import { BehaviorSubject, shareReplay } from "rxjs";
import { useEffect, useState } from "react";

const disposerFactory =
  <T>(store: Store<T>) =>
  async () => {
    for await (const sub of Object.values(store.selfSubscription)) {
      sub.unsubscribe();
    }
  };

const getUserName = async () => {
  const res = await runAppleScript(
    `
      on run argv
        tell application "System Events"
          set name_ to full name of current user
        end tell
      end run
    `,
    [],
  );
  return res;
};

const killNitroProcess = async () => {
  const res = await runAppleScript(
    `
      on run argv
        do shell script "pkill nitro"
      end run
    `,
    [],
  );
  return res;
};

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

const useUserInfo = () => {
  useEffect(() => {
    userInfoStore.init();
    return () => {
      userInfoStore[Symbol.asyncDispose]();
    };
  }, []);
};

export { disposerFactory, killNitroProcess, userInfoStore, useUserInfo };
