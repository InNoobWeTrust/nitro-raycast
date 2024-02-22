# nitro-raycast

[![stability-wip](https://img.shields.io/badge/stability-wip-lightgrey.svg)](https://github.com/mkenney/software-guides/blob/master/STABILITY-BADGES.md#work-in-progress)

![Screenshot 1](docs/static/img/01-nitro-raycast-empty-chat.png)
![Screenshot 2](docs/static/img/02-nitro-raycast-agents.png)
![Screenshot 3](docs/static/img/03-nitro-raycast-chat.png)
![Screenshot 4](docs/static/img/04-nitro-raycast-action-panel.png)

Nitro raycast extension. Using LLM right from Raycast.

This is a shameless wrapper around [Nitro](https://github.com/janhq/nitro), to allow easy use in [Raycast](https://www.raycast.com/).

Currently, this is just a placeholder until I can make it work. Behold, the wave of Llamas is coming to you soon!

Reference for logical flow: [raycast/extensions | Add speedtest #302](https://github.com/raycast/extensions/pull/302)

## TODO:

- [ ] Using `@janhq/nitro-node` when it is published on NPM instead of hacking around the installation hooks. See: [janhq/jan#1635](https://github.com/janhq/jan/issues/1635)
- [ ] Auto check and update latest release of `nitro` or let user choose the version they want to use.
- [ ] Shamelessly copy the user interface of OpenAI chat and Hugging Face chat. Sorry I'm not a designer so don't sue me for copying the UI from the other chat models.
- [ ] Let users choose models they want to use and download it automatically.
- [ ] Let users pick the `prompt_template` on the known list to try on the new model. If they accept the `prompt_template` it will be used.
- [ ] Let LLM (tiny-llama) helps guessing the best prompt template to use and highlight it to user.
- [ ] Choice of installation directory and model directory.
- [ ] Option to use [hugging-chat-api](https://github.com/Soulter/hugging-chat-api) instead of running models locally? Am I going to abuse their servers?!?
- [x] Be really lazy and summon Llamas to work for me by utilizing Raycast.

## Goals:

- [ ] Don't abandon this project like other pet projects in the past (most even never leave local machine)
- [ ] Summon as many Lllamas as possible.
- [ ] Make my robot waifu become real!