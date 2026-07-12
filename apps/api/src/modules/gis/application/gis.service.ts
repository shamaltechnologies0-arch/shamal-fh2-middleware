import type { NormalizedTrajectory } from "../../../shared/normalize/normalize.service.js";

export function trajectoryToGeoJson(
  trajectory: NormalizedTrajectory,
): {
  type: "FeatureCollection";
  features: Array<Record<string, unknown>>;
} {
  const coordinates = trajectory.points.map((p) => [
    p.longitude,
    p.latitude,
    p.altitudeM,
  ]);

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          taskId: trajectory.taskId,
          droneSerialNumber: trajectory.droneSerialNumber,
          flightDistanceM: trajectory.flightDistanceM,
          flightDurationSec: trajectory.flightDurationSec,
        },
        geometry: {
          type: "LineString",
          coordinates,
        },
      },
      ...trajectory.points.map((p) => ({
        type: "Feature" as const,
        properties: {
          taskId: trajectory.taskId,
          timestamp: p.timestamp,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [p.longitude, p.latitude, p.altitudeM],
        },
      })),
    ],
  };
}

export function trajectoryToKml(trajectory: NormalizedTrajectory): string {
  const coords = trajectory.points
    .map((p) => `${p.longitude},${p.latitude},${p.altitudeM}`)
    .join(" ");

  const points = trajectory.points
    .map(
      (p) => `
    <Placemark>
      <name>Point ${p.timestamp}</name>
      <Point><coordinates>${p.longitude},${p.latitude},${p.altitudeM}</coordinates></Point>
    </Placemark>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Task ${trajectory.taskId}</name>
    <Placemark>
      <name>Flight path</name>
      <LineString><coordinates>${coords}</coordinates></LineString>
    </Placemark>${points}
  </Document>
</kml>`;
}
