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
      next: (v) => setState(v),
    });

    return () => {
      sub.unsubscribe();
    };
  }, []);

  return state;
};

const toSerializable = (obj: unknown): unknown => JSON.parse(JSON.stringify(obj));

const isFlattened = (obj: Record<string, unknown>): boolean => {
  const nestedProps = Object.values(obj).map((v) =>
    typeof v === "object" && !Array.isArray(v) ? Object.values(v as Record<string, unknown>).length : false,
  );
  return !nestedProps.some(Boolean);
};

const flattenProps = (obj: Record<string, unknown>, maxDepth: number = NaN): Record<string, unknown> => {
  let res = obj;
  while (!isFlattened(res)) {
    // Un-nest one level at a time
    res = Object.entries(res).reduce(
      (acc, [k, v]) => {
        // Only un-nest object
        if (typeof v === "object" && !Array.isArray(v)) {
          // Un-nest
          for (const nestedKey in v) {
            // Assign to new key
            acc[`${k}.${nestedKey}`] = v[nestedKey as keyof typeof v];
          }
        } else {
          acc[k] = v;
        }
        return acc;
      },
      {} as Record<string, unknown>,
    );

    // Check if exceed max-depth
    if (!Number.isNaN(maxDepth) && maxDepth > 0) {
      --maxDepth;
      // Break if maxDepth is exhausted
      if (!maxDepth) {
        break;
      }
    }
  }
  return res;
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

export {
  disposerFactory,
  useSubscribableState,
  toSerializable,
  isFlattened,
  flattenProps,
  killNitroProcess,
  getUserName,
};
