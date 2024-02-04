import { ActionPanel, List, Action, Form, useNavigation } from "@raycast/api";
import { chatStore, useNitro } from "./nitro";
import { useEffect, useState } from "react";

export default function Command() {
  const { pop } = useNavigation();
  const [markdown, setMarkdown] = useState("");
  useNitro();

  useEffect(() => {
    chatStore.subject.subscribe({
      next: (chats) => {
        setMarkdown(chats.map((section) => section.content).join("\n\n---\n\n"));
      },
    });
  }, []);

  return (
    <List isShowingDetail>
      <List.Item
        icon="list-icon.png"
        title="Chat"
        detail={<List.Item.Detail isLoading={chatStore.busyStatus.getValue()} markdown={markdown} />}
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
          </ActionPanel>
        }
      />
    </List>
  );
}
