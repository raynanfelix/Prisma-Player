import { Composition } from "remotion";
import { LaunchVideo } from "./LaunchVideo";

export const MyComposition = () => {
  return (
    <Composition
      id="PrismaLaunch"
      component={LaunchVideo}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};