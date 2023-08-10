import { Request, Response } from "express";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase/firebase";
import ytdl from "ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import path from 'path';
import fs from 'fs';

// Function to sanitize the video title for use as a filename
function sanitizeFilename(filename: string): string {
  return filename.replace(/[<>:"/\\|?*]+/g, '_');
}

export async function downloadMP3(req: Request, res: Response) {
  const url = req.body.url;

  if (
    !url ||
    (!url.includes("youtu.be/") && !url.includes("youtube.com/watch?v="))
  ) {
    return res.status(400).send("Invalid YouTube URL provided.");
  }

  const info = await ytdl.getInfo(url);
  const audioFormat = ytdl.chooseFormat(info.formats, {
    quality: "highestaudio",
    filter: "audioonly",
  });

  if (!audioFormat) {
    return res.status(400).send("No suitable audio format found.");
  }

  // Use sanitized video title as filename
  const videoTitle = sanitizeFilename(info.videoDetails.title);
  const tempFileName = `${videoTitle}.mp3`;

  // Relative path to the temp directory
  const tempFolderPath = path.join(__dirname, '../temp');
  const tempFilePath = path.join(tempFolderPath, tempFileName);

  // Ensure the temp folder exists
  if (!fs.existsSync(tempFolderPath)) {
    fs.mkdirSync(tempFolderPath);
  }

  ffmpeg()
    .input(audioFormat.url)
    .inputFormat("webm")
    .audioCodec("libmp3lame")
    .toFormat("mp3")
    .on("end", async () => {
      console.log("Conversion finished.");

      // Upload the file to Firebase Storage
      const storageRef = ref(storage, tempFileName);
      const fileBytes = await fs.promises.readFile(tempFilePath);

      uploadBytes(storageRef, fileBytes).then(async snapshot => {
        console.log('Uploaded the file!');

        // Delete the temporary file and folder
        fs.unlinkSync(tempFilePath);
        fs.rmSync(tempFolderPath, { recursive: true });

        const downloadURL = await getDownloadURL(storageRef);
        res.send(downloadURL);
      }).catch(error => {
        console.error("Error uploading the file:", error);
        res.sendStatus(500);
      });
    })
    .on("error", (err) => {
      console.error("Error:", err);
      res.sendStatus(500);
    })
    .save(tempFilePath);
}
