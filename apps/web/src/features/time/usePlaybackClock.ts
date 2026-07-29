import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  advancePlayback,
  outboundPlaybackBoundary,
  type PlaybackBoundary,
  type PlaybackDirection,
  type PlaybackSpeed,
} from "./playbackClock";

type UsePlaybackClockOptions = {
  date: Date;
  onBoundary: (boundary: Exclude<PlaybackBoundary, null>) => void;
  onDateChange: (date: Date) => void;
};

function reducedMotionQuery() {
  if (typeof window === "undefined" || !window.matchMedia) {
    return null;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)");
}

export function usePlaybackClock({
  date,
  onBoundary,
  onDateChange,
}: UsePlaybackClockOptions) {
  const [direction, setDirectionState] =
    useState<PlaybackDirection>(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [motionRestricted, setMotionRestricted] = useState(
    () => reducedMotionQuery()?.matches ?? false,
  );
  const [speed, setSpeed] = useState<PlaybackSpeed>(3_600);
  const dateRef = useRef(date);
  const directionRef = useRef(direction);
  const speedRef = useRef(speed);

  useEffect(() => {
    dateRef.current = date;
  }, [date]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    const query = reducedMotionQuery();
    if (!query) {
      return;
    }
    const handleChange = () => {
      setMotionRestricted(query.matches);
      if (query.matches) {
        setIsPlaying(false);
      }
    };
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsPlaying(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
  }, []);

  useEffect(() => {
    if (!isPlaying || motionRestricted) {
      return;
    }

    let animationFrame = 0;
    let lastUpdate = performance.now();
    const minimumFrameMilliseconds = 1_000 / 12;

    const tick = (now: number) => {
      const elapsedMilliseconds = now - lastUpdate;
      if (elapsedMilliseconds >= minimumFrameMilliseconds) {
        lastUpdate = now;
        const advanced = advancePlayback({
          currentDate: dateRef.current,
          direction: directionRef.current,
          realDeltaSeconds: elapsedMilliseconds / 1_000,
          speed: speedRef.current,
        });
        dateRef.current = advanced.date;
        onDateChange(advanced.date);

        if (advanced.boundary) {
          setIsPlaying(false);
          onBoundary(advanced.boundary);
          return;
        }
      }
      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [
    isPlaying,
    motionRestricted,
    onBoundary,
    onDateChange,
  ]);

  const pause = useCallback(() => setIsPlaying(false), []);
  const setDirection = useCallback(
    (nextDirection: PlaybackDirection) => {
      directionRef.current = nextDirection;
      setDirectionState(nextDirection);

      if (!isPlaying) {
        return;
      }

      const boundary = outboundPlaybackBoundary(
        dateRef.current,
        nextDirection,
      );
      if (boundary) {
        setIsPlaying(false);
        onBoundary(boundary);
      }
    },
    [isPlaying, onBoundary],
  );
  const startPlayback = useCallback(() => {
    if (motionRestricted) {
      return;
    }

    const boundary = outboundPlaybackBoundary(
      dateRef.current,
      directionRef.current,
    );
    if (boundary) {
      setIsPlaying(false);
      onBoundary(boundary);
      return;
    }

    setIsPlaying(true);
  }, [motionRestricted, onBoundary]);
  const play = startPlayback;
  const toggle = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    startPlayback();
  }, [isPlaying, startPlayback]);

  return {
    direction,
    isPlaying,
    motionRestricted,
    pause,
    play,
    setDirection,
    setSpeed,
    speed,
    toggle,
  };
}
