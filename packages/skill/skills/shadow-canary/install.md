# /shadow-canary:install

When the user invokes this command, install shadow-canary on the current project by following:
https://raw.githubusercontent.com/mus-inn/shadow-canary/master/llms-install.md

Steps:
1. Fetch the llms-install.md file from the URL above using WebFetch.
2. Follow the instructions there step by step.
3. Ask the user for the inputs listed in the "Inputs to collect" section.
4. Execute all commands described (pre-flight detection, npm install, template copy, patches, commit).
5. Print the final "Manual steps the user must do" checklist from the guide.
6. Write `.shadow-canary.json` at the project root with the collected inputs (this enables other /shadow-canary:* commands).

Do NOT skip pre-flight checks. Do NOT skip manual-steps checklist output.
