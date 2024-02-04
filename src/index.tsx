import { ActionPanel, List, Action, Form } from "@raycast/api";
import { useNitro } from "./nitro";
import { useEffect, useState } from "react";

export default function Command() {
  const { isLoading, chats, addChat } = useNitro();
  const [markdown, setMarkdown] = useState("");

  useEffect(() => {
    setMarkdown(chats.join("\n---\n"));
  }, [chats]);

  return (
    <List isShowingDetail>
      <List.Item
        icon="list-icon.png"
        title="Chat"
        detail={<List.Item.Detail isLoading={isLoading} markdown={markdown} />}
        actions={
          <ActionPanel>
            <Action.Push
              title="Add Chat"
              target={
                <Form
                  actions={
                    <ActionPanel>
                      <Action.SubmitForm title="Submit" onSubmit={(values) => addChat(values.msg)} />
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
