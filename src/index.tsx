import { ActionPanel, Action, Form, useNavigation, Detail, showToast } from "@raycast/api";
import { chatConfigStore, chatHistoryStore, nitroManager, useNitro } from "./nitro";
import { useEffect, useState } from "react";
import { killNitroProcess, useUserInfo, userInfoStore } from "./utils";

export default function Command() {
  const { pop } = useNavigation();
  const [markdown, setMarkdown] = useState("");

  // Initialize the stores
  const { busy } = useNitro();
  useUserInfo();

  // Register observers
  useEffect(() => {
    // FIXME: Force kill nitro, as reloading with dev mode will make us lose track of the pid
    killNitroProcess();

    const subscriptions = [
      chatHistoryStore.subject.subscribe((chats) => {
        // Skip system prompt
        chats = chats.slice(1);
        if (!chats.length) {
          setMarkdown(`# <Empty chat>`);
          return;
        }
        setMarkdown(
          chats
            .map(
              (section) =>
                (section.role === "user"
                  ? `# 🧑 [${userInfoStore.subject.getValue().name}]\n`
                  : `# 🤖 [${chatConfigStore.subject.getValue().model || "Generic LLM"}]\n`) + section.content,
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
                        try {
                          chatHistoryStore.requestCompletion(values.msg);
                          pop();
                        } catch (e) {
                          showToast({ title: JSON.stringify(e) });
                        }
                      }}
                    />
                  </ActionPanel>
                }
              >
                <Form.TextArea id="msg" />
              </Form>
            }
          />
          <Action title="Reset Conversation" onAction={chatHistoryStore.reset} />
          <Action title="Restart Nitro" onAction={nitroManager.restart} />
        </ActionPanel>
      }
    />
  );
}
