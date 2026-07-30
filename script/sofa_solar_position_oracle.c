/*
 * Independent oracle driver for Planetarium's apparent-Sun audit.
 *
 * This original glue program calls an unmodified IAU SOFA ANSI C
 * 2023-10-11 library. It uses SOFA epv00 for the full Earth ephemeris,
 * ab for annual aberration, pnm06a for true-equator/equinox coordinates,
 * c2i06a for CIRS, pvtob for the WGS84 observing-site displacement, and
 * apio13/atioq for Earth orientation and the local horizon.
 * Refraction is disabled. Build it against the official release from:
 *
 *   https://www.iausofa.org/2023-10-11c
 *
 * Planetarium deliberately uses a 200-term truncation of the heliocentric
 * position series, omits the SSB-to-Sun velocity, and uses IAU 2000B
 * nutation. These vectors are therefore independent comparison targets
 * rather than byte-for-byte outputs of the application algorithm.
 *
 * This driver is not software provided by or endorsed by the IAU SOFA
 * Board. When distributing SOFA itself, its complete license applies.
 */

#include <math.h>
#include <sofa.h>
#include <sofam.h>
#include <stdio.h>
#include <stdlib.h>

typedef struct {
   const char *id;
   int year;
   int month;
   int day;
   int hour;
   int minute;
   double second;
   double longitude_degrees;
   double latitude_degrees;
   double height_meters;
   double dut1_seconds;
   double xp_arcseconds;
   double yp_arcseconds;
} FixtureCase;

static const double DEGREES_TO_RADIANS =
   0.017453292519943295769236907684886;
static const double ARCSECONDS_TO_RADIANS =
   4.8481368110953599358991410235795e-6;

static void fail(const char *message)
{
   fprintf(stderr, "%s\n", message);
   exit(EXIT_FAILURE);
}

static void output_case(const FixtureCase *fixture)
{
   double utc1;
   double utc2;
   double tai1;
   double tai2;
   double tt1;
   double tt2;
   double ut11;
   double ut12;
   double heliocentric_pv[2][3];
   double barycentric_pv[2][3];
   double natural[3];
   double velocity_c[3];
   double proper[3];
   double bias_precession_nutation[3][3];
   double equinox_direction[3];
   double celestial_to_intermediate[3][3];
   double cirs[3];
   double observer_pv[2][3];
   double topocentric_cirs[3];
   double topocentric_unit_cirs[3];
   double topocentric_distance;
   double right_ascension;
   double declination;
   double cirs_right_ascension;
   double cirs_declination;
   double distance;
   double speed_squared;
   double azimuth;
   double zenith_distance;
   double observed_hour_angle;
   double observed_declination;
   double observed_right_ascension;
   double sine_zenith_distance;
   double era;
   double sp;
   iauASTROM astrom;
   int status;
   int index;

   status = iauDtf2d(
      "UTC",
      fixture->year,
      fixture->month,
      fixture->day,
      fixture->hour,
      fixture->minute,
      fixture->second,
      &utc1,
      &utc2
   );
   if (status < 0) fail("iauDtf2d rejected a fixture date");
   if (iauUtctai(utc1, utc2, &tai1, &tai2) < 0) {
      fail("iauUtctai rejected a fixture date");
   }
   if (iauTaitt(tai1, tai2, &tt1, &tt2) != 0) {
      fail("iauTaitt failed");
   }
   if (
      iauUtcut1(
         utc1,
         utc2,
         fixture->dut1_seconds,
         &ut11,
         &ut12
      ) < 0
   ) {
      fail("iauUtcut1 rejected a fixture date");
   }
   if (iauEpv00(tt1, tt2, heliocentric_pv, barycentric_pv) != 0) {
      fail("iauEpv00 reported an out-of-range date");
   }

   distance = sqrt(
      heliocentric_pv[0][0] * heliocentric_pv[0][0]
      + heliocentric_pv[0][1] * heliocentric_pv[0][1]
      + heliocentric_pv[0][2] * heliocentric_pv[0][2]
   );
   for (index = 0; index < 3; index++) {
      natural[index] = -heliocentric_pv[0][index] / distance;
      velocity_c[index] =
         barycentric_pv[1][index] / DAYSEC * AULT;
   }
   speed_squared =
      velocity_c[0] * velocity_c[0]
      + velocity_c[1] * velocity_c[1]
      + velocity_c[2] * velocity_c[2];
   iauAb(
      natural,
      velocity_c,
      distance,
      sqrt(1.0 - speed_squared),
      proper
   );
   iauPnm06a(tt1, tt2, bias_precession_nutation);
   iauRxp(bias_precession_nutation, proper, equinox_direction);
   iauC2s(equinox_direction, &right_ascension, &declination);
   right_ascension = iauAnp(right_ascension);
   iauC2i06a(tt1, tt2, celestial_to_intermediate);
   iauRxp(celestial_to_intermediate, proper, cirs);
   era = iauEra00(ut11, ut12);
   sp = iauSp00(tt1, tt2);
   iauPvtob(
      fixture->longitude_degrees * DEGREES_TO_RADIANS,
      fixture->latitude_degrees * DEGREES_TO_RADIANS,
      fixture->height_meters,
      fixture->xp_arcseconds * ARCSECONDS_TO_RADIANS,
      fixture->yp_arcseconds * ARCSECONDS_TO_RADIANS,
      sp,
      era,
      observer_pv
   );
   for (index = 0; index < 3; index++) {
      topocentric_cirs[index] =
         distance * cirs[index] - observer_pv[0][index] / DAU;
   }
   iauPn(
      topocentric_cirs,
      &topocentric_distance,
      topocentric_unit_cirs
   );
   if (!(topocentric_distance > 0.0)) {
      fail("topocentric Sun vector is zero");
   }
   iauC2s(
      topocentric_unit_cirs,
      &cirs_right_ascension,
      &cirs_declination
   );
   cirs_right_ascension = iauAnp(cirs_right_ascension);

   status = iauApio13(
      utc1,
      utc2,
      fixture->dut1_seconds,
      fixture->longitude_degrees * DEGREES_TO_RADIANS,
      fixture->latitude_degrees * DEGREES_TO_RADIANS,
      fixture->height_meters,
      fixture->xp_arcseconds * ARCSECONDS_TO_RADIANS,
      fixture->yp_arcseconds * ARCSECONDS_TO_RADIANS,
      0.0,
      10.0,
      0.0,
      0.55,
      &astrom
   );
   if (status < 0) fail("iauApio13 rejected a fixture date");
   iauAtioq(
      cirs_right_ascension,
      cirs_declination,
      &astrom,
      &azimuth,
      &zenith_distance,
      &observed_hour_angle,
      &observed_declination,
      &observed_right_ascension
   );
   (void)observed_hour_angle;
   (void)observed_declination;
   (void)observed_right_ascension;

   sine_zenith_distance = sin(zenith_distance);
   printf("    {\n");
   printf("      \"id\": \"%s\",\n", fixture->id);
   printf(
      "      \"observedAtIso\": \"%04d-%02d-%02dT%02d:%02d:%02.0fZ\",\n",
      fixture->year,
      fixture->month,
      fixture->day,
      fixture->hour,
      fixture->minute,
      fixture->second
   );
   printf(
      "      \"location\": {\"longitudeDegrees\": %.10g, "
      "\"latitudeDegrees\": %.10g, \"heightMeters\": %.10g},\n",
      fixture->longitude_degrees,
      fixture->latitude_degrees,
      fixture->height_meters
   );
   printf(
      "      \"earthOrientation\": {\"dut1Seconds\": %.17g, "
      "\"xpArcseconds\": %.17g, \"ypArcseconds\": %.17g},\n",
      fixture->dut1_seconds,
      fixture->xp_arcseconds,
      fixture->yp_arcseconds
   );
   printf(
      "      \"expectedHeliocentricEarthPositionAu\": "
      "[%.17g, %.17g, %.17g],\n",
      heliocentric_pv[0][0],
      heliocentric_pv[0][1],
      heliocentric_pv[0][2]
   );
   printf(
      "      \"expectedApparentEquatorialRadians\": "
      "[%.17g, %.17g],\n",
      right_ascension,
      declination
   );
   printf(
      "      \"expectedHorizontalEnu\": [%.17g, %.17g, %.17g]\n",
      sine_zenith_distance * sin(azimuth),
      sine_zenith_distance * cos(azimuth),
      cos(zenith_distance)
   );
   printf("    }");
}

int main(void)
{
   const FixtureCase cases[] = {
      {
         "greenwich-march-equinox-j2000",
         2000, 3, 20, 12, 0, 0.0,
         0.0, 0.0, 0.0,
         0.0, 0.0, 0.0
      },
      {
         "tokyo-iers-eop-2026-midnight",
         2026, 7, 29, 0, 0, 0.0,
         139.7671, 35.6812, 0.0,
         0.0124136, 0.220152, 0.365198
      },
      {
         "tokyo-iers-eop-2026-noon",
         2026, 7, 29, 12, 0, 0.0,
         139.7671, 35.6812, 0.0,
         0.0124136, 0.220152, 0.365198
      },
      {
         "sydney-december-solstice-2050",
         2050, 12, 21, 1, 30, 0.0,
         151.2093, -33.8688, 0.0,
         0.0, 0.0, 0.0
      },
      {
         "tromso-polar-night-2099",
         2099, 12, 21, 10, 0, 0.0,
         18.9553, 69.6492, 0.0,
         0.0, 0.0, 0.0
      },
      {
         "greenwich-compact-ephemeris-maximum-2061",
         2061, 5, 12, 2, 48, 24.0,
         0.0, 0.0, 0.0,
         0.0, 0.0, 0.0
      },
      {
         "greenwich-truncated-ephemeris-maximum-2098",
         2098, 2, 20, 11, 8, 41.0,
         0.0, 0.0, 0.0,
         0.0, 0.0, 0.0
      },
      {
         "mauna-kea-high-altitude-sunrise-2026",
         2026, 7, 29, 16, 0, 0.0,
         -155.4681, 19.8206, 4205.0,
         0.0124136, 0.220152, 0.365198
      }
   };
   const size_t count = sizeof(cases) / sizeof(cases[0]);
   size_t index;

   printf("{\n");
   printf("  \"schemaVersion\": 1,\n");
   printf(
      "  \"oracle\": \"IAU SOFA ANSI C 2023-10-11 unmodified "
      "epv00/ab/pnm06a/c2i06a/pvtob/apio13/atioq\",\n"
   );
   printf(
      "  \"archiveUrl\": "
      "\"https://www.iausofa.org/s/sofa_c-20231011tar.gz\",\n"
   );
   printf(
      "  \"retrievedArchiveSha256\": "
      "\"d9c10833cae8b4d9361a0ffda31ec361fd1262362025bec4d4e51a880150ace2\",\n"
   );
   printf(
      "  \"driver\": \"script/sofa_solar_position_oracle.c\",\n"
   );
   printf(
      "  \"assumptions\": {\"ephemerisTimeScale\": \"TT as TDB proxy\", "
      "\"refraction\": \"disabled\", "
      "\"horizontalOrigin\": \"WGS84 topocenter\", "
      "\"futureTaiMinusUtcSeconds\": 37, "
      "\"horizontalAxes\": \"east,north,up\"},\n"
   );
   printf("  \"cases\": [\n");
   for (index = 0; index < count; index++) {
      output_case(&cases[index]);
      printf("%s\n", index + 1 == count ? "" : ",");
   }
   printf("  ]\n");
   printf("}\n");
   return 0;
}
