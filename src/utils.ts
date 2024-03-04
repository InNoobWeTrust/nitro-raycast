import { runAppleScript } from "@raycast/utils";
import { Store } from "./types";
import { Subscribable } from "rxjs";
import { useEffect, useState } from "react";

const disposerFactory =
  <T>(store: Store<T>) =>
  async () => {
    for await (const sub of Object.values(store.selfSubscription)) {
      sub.unsubscribe();
    }
  };

const useSubscribableState = <T>(ob$: Subscribable<T>, initial: T) => {
  const [state, setState] = useState<T>(initial);

  useEffect(() => {
    const sub = ob$.subscribe({
      next: setState,
    });

    return () => {
      sub.unsubscribe();
    };
  }, []);

  return state;
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

export { disposerFactory, useSubscribableState, killNitroProcess, getUserName };
