require("dotenv").config();
const Imap = require("imap");
const { simpleParser } = require("mailparser");
const cheerio = require("cheerio");
const fs = require("fs");

const imap = new Imap({
  user: process.env.EMAIL_USER,
  password: process.env.EMAIL_PASSWORD,
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  tls: true,
  connTimeout: 10000, // Connection timeout in milliseconds
  authTimeout: 10000, // Authentication timeout in milliseconds
});

function openInbox(cb) {
  imap.openBox("INBOX", false, cb);
}

imap.once("ready", function () {
  openInbox((err, box) => {
    if (err) throw err;

    imap.search(["ALL"], (err, results) => {
      if (err) throw err;
      const fetchOptions = {
        bodies: "",
        struct: true,
      };
      const fetched = imap.fetch(results.slice(-100), fetchOptions);

      let emailList = [];
      let sendersSet = new Set();

      fetched.on("message", (msg, seqno) => {
        let emailData = {};

        msg.on("body", (stream, info) => {
          simpleParser(stream, (err, parsed) => {
            if (err) throw err;

            const sender = parsed.from.text;
            if (!sendersSet.has(sender)) {
              sendersSet.add(sender);
              emailData.sender = sender;
              emailData.subject = parsed.subject;

              const listUnsubscribe = parsed.headers.get("list-unsubscribe");
              if (listUnsubscribe) {
                const matches = listUnsubscribe.match(/<(.+?)>/);
                emailData.unsubscribe = matches
                  ? matches[1]
                  : "No Unsubscribe Link";
              } else {
                // Parse the HTML content to find the unsubscribe link
                const $ = cheerio.load(parsed.html);
                const unsubscribeLink = $('a:contains("Unsubscribe")').attr(
                  "href"
                );
                emailData.unsubscribe =
                  unsubscribeLink || "No Unsubscribe Link";
              }

              emailList.push(emailData);
            }
          });
        });
      });

      fetched.once("end", () => {
        fs.writeFileSync("unsubscribe_list.html", generateHTML(emailList));
        console.log("Email processing complete. Check unsubscribe_list.html");
        imap.end();
      });
    });
  });
});

imap.once("error", (err) => {
  console.log(err);
});

imap.connect();

function generateHTML(emailList) {
  let html = "<html><head><title>Unsubscribe List</title></head><body>";
  html +=
    '<h2>Subscribed Emails</h2><table border="1"><tr><th>Sender</th><th>Subject</th><th>Unsubscribe</th></tr>';
  emailList.forEach((email) => {
    if (email.unsubscribe === "No Unsubscribe Link") {
      html += `<tr><td>${email.sender}</td><td>${email.subject}</td><td>No Unsubscribe Link</td></tr>`;
    } else {
      html += `<tr><td>${email.sender}</td><td>${email.subject}</td><td><a href="${email.unsubscribe}" target="_blank">Unsubscribe</a></td></tr>`;
    }
  });
  html += "</table></body></html>";
  return html;
}
