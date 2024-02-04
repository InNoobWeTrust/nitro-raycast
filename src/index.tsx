import { ActionPanel, List, Action, Form, useNavigation, Detail } from "@raycast/api";
import { chatStore, useNitro } from "./nitro";
import { useEffect, useState } from "react";

export default function Command() {
  const { pop } = useNavigation();
  const [markdown, setMarkdown] = useState("");
  useNitro();

  useEffect(() => {
    chatStore.subject.subscribe({
      next: (chats) => {
        if (!chats.length) {
          setMarkdown(`# <Empty chat>`);
          return;
        }
        setMarkdown(
          chats.map((section) => ((section.role === "user" && "# ") || "") + section.content).join("\n\n---\n\n"),
        );
      },
    });
  }, []);

  return (
    <Detail
      isLoading={chatStore.status.busy.getValue()}
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
                        chatStore.requestCompletion(values.msg);
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
          <Action title="Reset Conversation" onAction={() => chatStore.reset()} />
        </ActionPanel>
      }
    />
  );
}
