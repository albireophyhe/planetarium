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
  const isPlayingRef = useRef(isPlaying);
  const speedRef = useRef(speed);
  const setPlaying = useCallback((nextPlaying: boolean) => {
    isPlayingRef.current = nextPlaying;
    setIsPlaying(nextPlaying);
  }, []);

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
        setPlaying(false);
      }
    };
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, [setPlaying]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setPlaying(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
  }, [setPlaying]);

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
          setPlaying(false);
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
    setPlaying,
  ]);

  const pause = useCallback(() => setPlaying(false), [setPlaying]);
  const setDirection = useCallback(
    (nextDirection: PlaybackDirection) => {
      directionRef.current = nextDirection;
      setDirectionState(nextDirection);

      if (!isPlayingRef.current) {
        return;
      }

      const boundary = outboundPlaybackBoundary(
        dateRef.current,
        nextDirection,
      );
      if (boundary) {
        setPlaying(false);
        onBoundary(boundary);
      }
    },
    [onBoundary, setPlaying],
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
      setPlaying(false);
      onBoundary(boundary);
      return;
    }

    setPlaying(true);
  }, [motionRestricted, onBoundary, setPlaying]);
  const play = startPlayback;
  const toggle = useCallback(() => {
    if (isPlayingRef.current) {
      setPlaying(false);
      return;
    }

    startPlayback();
  }, [setPlaying, startPlayback]);

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
