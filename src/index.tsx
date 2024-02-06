import { ActionPanel, Action, Form, useNavigation, Detail } from "@raycast/api";
import { chatHistoryStore, useNitro } from "./nitro";
import { useEffect, useState } from "react";

export default function Command() {
  const { pop } = useNavigation();
  const [markdown, setMarkdown] = useState("");
  useNitro();

  useEffect(() => {
    chatHistoryStore.subject.subscribe({
      next: (chats) => {
        // Skip system prompt
        chats = chats.slice(1);
        if (!chats.length) {
          setMarkdown(`# <Empty chat>`);
          return;
        }
        setMarkdown(
          chats.map((section) => (section.role === "user" ? "# 🧑 " : "# 🤖 ") + section.content).join("\n\n---\n\n"),
        );
      },
    });
  }, []);

  return (
    <Detail
      isLoading={chatHistoryStore.status.busy.getValue()}
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
                        chatHistoryStore.requestCompletion(values.msg);
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
          <Action title="Reset Conversation" onAction={() => chatHistoryStore.reset()} />
        </ActionPanel>
      }
    />
  );
}
