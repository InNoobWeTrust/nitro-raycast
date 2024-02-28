import { ActionPanel, Action, Form, useNavigation, Detail, showToast, confirmAlert } from "@raycast/api";
import { chatConfigStore, chatHistoryStore, nitroManager, useNitro } from "./nitro";
import { useEffect, useState } from "react";
import { killNitroProcess, useUserInfo, userInfoStore } from "./utils";
import { combineLatest, shareReplay } from "rxjs";

export default function Command() {
  const { pop } = useNavigation();
  const [markdown, setMarkdown] = useState("");

  // Initialize the stores
  const { busy } = useNitro();
  useUserInfo();

  // Register observers, one hook to rule them all!
  useEffect(() => {
    // FIXME: Force kill nitro, as reloading with dev mode will make us lose track of the pid
    killNitroProcess();

    const subscriptions = [
      combineLatest([
        userInfoStore.subject.pipe(shareReplay(1)),
        chatConfigStore.subject.pipe(shareReplay(1)),
        chatHistoryStore.subject.pipe(shareReplay(1)),
      ]).subscribe(([userInfo, chatConfig, chats]) => {
        // Skip system prompt
        chats = chats.slice(1);
        if (!chats.length) {
          setMarkdown(`# Empty chat`);
          return;
        }
        setMarkdown(
          chats
            .map(
              (section) =>
                (section.role === "user"
                  ? `# 🧑 [${userInfo.name}]\n`
                  : `# 🤖 [${chatConfig.model || "Generic LLM"}]\n`) + section.content,
            )
            .join("\n\n---\n\n"),
        );
      }),
    ];
    return () => {
      subscriptions.forEach((s) => s.unsubscribe());
      // FIXME: Force kill nitro, as reloading with dev mode will make us lose track of the pid
      killNitroProcess();
    };
  }, []);

  return (
    <Detail
      isLoading={busy}
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action.Push
            title="Add Chat"
            target={
              <Form
                actions={
                  <ActionPanel>
                    <Action.SubmitForm
                      title="Submit"
                      onSubmit={(values) => {
                        if (!values.msg.trim().length) {
                          showToast({
                            title: "Please type something before submitting",
                          });
                          return;
                        }
                        // Delay request for completion until we are back to default view
                        setTimeout(
                          () =>
                            // Request completion and leave it run until complete
                            chatHistoryStore.requestCompletion(values.msg).catch((e) => {
                              showToast({ title: JSON.stringify(e) });
                            }),
                          250,
                        );
                        // Pop out of view
                        pop();
                      }}
                    />
                  </ActionPanel>
                }
              >
                <Form.TextArea id="msg" />
              </Form>
            }
          />
          <Action
            title="Reset Conversation"
            onAction={() => {
              confirmAlert({
                title: "Reset conversation?",
                message: "You will lose all chat history. Continue?",
                primaryAction: {
                  title: "Reset",
                  onAction: () => {
                    try {
                      chatHistoryStore.reset();
                    } catch (e) {
                      showToast({
                        title: JSON.stringify(e),
                      });
                    }
                  },
                },
              });
            }}
          />
          <Action
            title="Restart Nitro"
            onAction={async () => {
              confirmAlert({
                title: "Restart nitro?",
                message:
                  "Force restart nitro can result in unintended effect, please make sure you are aware of losing chat history before confirming.",
                primaryAction: {
                  title: "Restart",
                  onAction: () => nitroManager.restart,
                },
              });
            }}
          />
        </ActionPanel>
      }
    />
  );
}
