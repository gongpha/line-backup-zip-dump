# LINE Backup ZIP Dump
LINE Backup ZIP Dump is a tool to extract and view chat history from LINE backup ZIP files.

The decryption key recovery algorithm is implemented based on [bovarysme's memories](https://github.com/bovarysme/memories).

## Features
- Extract chat history and display it in LINE on PC style
- Display messages, attachment thumbnails, stickers, and date separators

## Usage
1. Go to [the Github page](https://gongpha.github.io/line-backup-zip-dump/)
2. Enter the zip file in **ZIP**
3. Click **Dump**
4. Wait for the process to finish (take up more than minutes, hours, or days), then click on `uXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` tab to see the chat history.

You can save the **Found IV** number inside the `Dump Info` tab for future use (for each ZIP file) by entering the saved IV number in the `Start IV Hint` field to skip the key recovery process.

> [!NOTE]
> The key recovery process in this tool is very slow and takes a long time to complete. It is recommended to use [bovarysme's memories](https://github.com/bovarysme/memories) for faster key recovery. Then use the recovered IV from the `memories` tool in the `Start IV Hint` field.