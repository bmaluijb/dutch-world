/* Generates Dutch audio for every word in index.html using Microsoft's
   neural voice (nl-NL-FennaNeural) via msedge-tts.
   Output: audio/<word>.mp3       -> "de hond"  (article + word)
           audio/<word>.solo.mp3  -> "hond"     (word only, for the de/het quiz)
   Re-run safe: existing files are skipped.                                  */
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import fs from "fs";
import path from "path";

const html = fs.readFileSync("index.html", "utf8");
const re = /\["([^"]+)","[^"]*?","(de|het)","[^"]*?",\d/g;
const words = new Map();
let m;
while ((m = re.exec(html)) !== null) words.set(m[1], m[2]);
console.log(`Found ${words.size} words in index.html`);

fs.mkdirSync("audio", { recursive: true });

const jobs = [];
for (const [nl, art] of words) {
  const full = path.join("audio", `${nl}.mp3`);
  const solo = path.join("audio", `${nl}.solo.mp3`);
  if (!fs.existsSync(full) || fs.statSync(full).size === 0) jobs.push({ file: full, text: `${art} ${nl}` });
  if (!fs.existsSync(solo) || fs.statSync(solo).size === 0) jobs.push({ file: solo, text: nl });
}
console.log(`${jobs.length} files to generate`);

const VOICE = "nl-NL-FennaNeural";
const RATE = { rate: "-15%" }; // a touch slower, kid-friendly

async function synthOne(tts, job) {
  const { audioStream } = tts.toStream(job.text, RATE);
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(job.file);
    audioStream.pipe(out);
    out.on("finish", resolve);
    audioStream.on("error", reject);
    out.on("error", reject);
  });
  if (fs.statSync(job.file).size === 0) throw new Error("empty file");
}

let done = 0, failed = [];
async function worker(id) {
  let tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  for (;;) {
    const job = jobs.shift();
    if (!job) break;
    try {
      await synthOne(tts, job);
    } catch (e) {
      /* one retry with a fresh connection */
      try {
        tts = new MsEdgeTTS();
        await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        await synthOne(tts, job);
      } catch (e2) {
        failed.push(job.file);
        try { fs.unlinkSync(job.file); } catch {}
      }
    }
    done++;
    if (done % 25 === 0) console.log(`  ${done} done…`);
  }
}

await Promise.all([worker(1), worker(2), worker(3), worker(4)]);
console.log(`Finished. ${done - failed.length} ok, ${failed.length} failed.`);
if (failed.length) { console.log("Failed:", failed.join(", ")); process.exit(1); }
