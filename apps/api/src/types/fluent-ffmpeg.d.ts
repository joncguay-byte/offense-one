declare module "fluent-ffmpeg" {
  type FfmpegCommand = {
    setFfmpegPath(path: string): FfmpegCommand;
    noVideo(): FfmpegCommand;
    audioCodec(codec: string): FfmpegCommand;
    audioChannels(channels: number): FfmpegCommand;
    audioFrequency(frequency: number): FfmpegCommand;
    format(format: string): FfmpegCommand;
    on(event: "end", listener: () => void): FfmpegCommand;
    on(event: "error", listener: (error: Error) => void): FfmpegCommand;
    save(outputPath: string): FfmpegCommand;
  };

  export default function ffmpeg(input?: string): FfmpegCommand;
}
