import { useEffect, useState } from "react";

function getClockParts(now) {
  const time = (timeZone) => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(now);
    } catch {
      return "";
    }
  };

  let date = "";
  try {
    date = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(now);
  } catch {
    // Keep the date blank if the browser does not support the configured zone.
  }

  return { pht: time("Asia/Manila"), pst: time("America/Los_Angeles"), date };
}

export default function Clock() {
  const [parts, setParts] = useState(() => getClockParts(new Date()));

  useEffect(() => {
    const timer = window.setInterval(() => setParts(getClockParts(new Date())), 20_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="clock" id="clock">
      <span><b>PHT</b>{parts.pht}</span>
      <span><b>PST</b>{parts.pst}</span>
      <span className="dt">{parts.date}</span>
    </div>
  );
}
