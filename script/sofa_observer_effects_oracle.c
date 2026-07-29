/*
 * Independent oracle driver for the Planetarium observer-effects audit.
 *
 * This program calls the unmodified IAU SOFA ANSI C 2023-10-11 library.
 * It does not contain or adapt SOFA algorithms.  Build it against the
 * official release from:
 *
 *   https://www.iausofa.org/2023-10-11c
 *
 * The --fixtures mode isolates SOFA iauApio/iauAtioq diurnal aberration:
 * polar motion, TIO locator and refraction are zero, and the input is already
 * a CIRS direction.  Consequently annual aberration, precession-nutation and
 * sidereal-time routines are not part of the oracle path.
 *
 * The --scan mode measures:
 *   1. diurnal aberration at WGS84 ellipsoid height 0 m; and
 *   2. a fixed polar-motion envelope equal to the largest observed vector in
 *      the repository's official finals2000A.all snapshot
 *      (MJD 50235, xp=0.065407", yp=0.596295").
 *
 * For each comparison, refraction is zero.  The maximizing source direction
 * is constructed analytically and the final separation is still measured
 * from independent SOFA iauAtioq outputs using atan2(|a×b|,a·b).
 *
 * This driver is original glue code, not software provided by or endorsed by
 * the IAU SOFA Board.  When distributing the SOFA library itself, its own
 * complete license and notice requirements continue to apply.
 */

#include <math.h>
#include <sofa.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
   const char *id;
   int year;
   int month;
   int day;
   double day_fraction;
   double longitude_degrees;
   double latitude_degrees;
   double height_meters;
   double hour_angle_degrees;
   double declination_degrees;
} FixtureCase;

typedef struct {
   double east;
   double north;
   double up;
} EnuVector;

static const double TWO_PI = 6.283185307179586476925286766559;
static const double ARCSECONDS_PER_RADIAN = 206264.8062470963551564734;
static const double EXTREME_XP_ARCSECONDS = 0.065407;
static const double EXTREME_YP_ARCSECONDS = 0.596295;

static double degrees_to_radians(double value)
{
   return value * (TWO_PI / 360.0);
}

static double clamp_unit(double value)
{
   return value < -1.0 ? -1.0 : (value > 1.0 ? 1.0 : value);
}

static EnuVector normalize_enu(EnuVector value)
{
   const double magnitude =
      sqrt(value.east * value.east +
           value.north * value.north +
           value.up * value.up);
   EnuVector result = {
      value.east / magnitude,
      value.north / magnitude,
      value.up / magnitude
   };
   return result;
}

static double dot_enu(EnuVector left, EnuVector right)
{
   return left.east * right.east +
          left.north * right.north +
          left.up * right.up;
}

static EnuVector cross_enu(EnuVector left, EnuVector right)
{
   EnuVector result = {
      left.north * right.up - left.up * right.north,
      left.up * right.east - left.east * right.up,
      left.east * right.north - left.north * right.east
   };
   return result;
}

static double separation_arcseconds(EnuVector left, EnuVector right)
{
   const EnuVector cross = cross_enu(left, right);
   const double sine =
      sqrt(dot_enu(cross, cross));
   const double cosine = clamp_unit(dot_enu(left, right));
   return atan2(sine, cosine) * ARCSECONDS_PER_RADIAN;
}

static double earth_rotation_angle(
   int year,
   int month,
   int day,
   double day_fraction
)
{
   double djm0;
   double djm;
   if (iauCal2jd(year, month, day, &djm0, &djm) != 0) {
      fprintf(stderr, "Invalid calendar date\n");
      exit(EXIT_FAILURE);
   }
   return iauEra00(djm0, djm + day_fraction);
}

static iauASTROM prepare_context(
   double theta,
   double longitude,
   double latitude,
   double height,
   double xp,
   double yp,
   int include_diurnal_aberration
)
{
   iauASTROM astrom;
   iauApio(
      0.0,
      theta,
      longitude,
      latitude,
      height,
      xp,
      yp,
      0.0,
      0.0,
      &astrom
   );
   if (!include_diurnal_aberration) {
      astrom.diurab = 0.0;
   }
   return astrom;
}

static EnuVector observed_enu(
   double right_ascension,
   double declination,
   iauASTROM *astrom
)
{
   double azimuth;
   double zenith_distance;
   double hour_angle;
   double observed_declination;
   double observed_right_ascension;
   double sine_zenith_distance;
   EnuVector result;

   iauAtioq(
      right_ascension,
      declination,
      astrom,
      &azimuth,
      &zenith_distance,
      &hour_angle,
      &observed_declination,
      &observed_right_ascension
   );
   (void)hour_angle;
   (void)observed_declination;
   (void)observed_right_ascension;

   sine_zenith_distance = sin(zenith_distance);
   result.east = sine_zenith_distance * sin(azimuth);
   result.north = sine_zenith_distance * cos(azimuth);
   result.up = cos(zenith_distance);
   return normalize_enu(result);
}

static void cirs_from_vector(
   EnuVector vector,
   double *right_ascension,
   double *declination
)
{
   *right_ascension = atan2(vector.north, vector.east);
   *declination = atan2(
      vector.up,
      hypot(vector.east, vector.north)
   );
}

static void output_fixtures(void)
{
   static const FixtureCase cases[] = {
      {
         "tokyo-meridian-south-1900",
         1900, 1, 1, 0.0,
         139.7671, 35.6812, 0.0,
         0.0, -9.3188
      },
      {
         "tokyo-pole-j2000",
         2000, 1, 1, 0.5,
         139.7671, 35.6812, 0.0,
         0.0, 90.0
      },
      {
         "tokyo-east-velocity-aligned-2100",
         2100, 12, 31, 0.999988425925926,
         139.7671, 35.6812, 0.0,
         -90.0, 0.0
      },
      {
         "equator-meridian-j2000",
         2000, 1, 1, 0.5,
         0.0, 0.0, 0.0,
         0.0, 0.0
      },
      {
         "latitude-75-meridian-2026",
         2026, 7, 29, 0.5,
         0.0, 75.0, 0.0,
         0.0, 30.0
      },
      {
         "sydney-meridian-2026",
         2026, 7, 29, 0.5,
         151.2093, -33.8688, 0.0,
         0.0, -60.0
      },
      {
         "tokyo-height-1000m-2026",
         2026, 7, 29, 0.5,
         139.7671, 35.6812, 1000.0,
         0.0, 0.0
      }
   };
   const size_t count = sizeof(cases) / sizeof(cases[0]);
   size_t index;

   printf("{\n");
   printf("  \"schemaVersion\": 1,\n");
   printf("  \"oracle\": \"IAU SOFA ANSI C 2023-10-11 unmodified apio/atioq\",\n");
   printf("  \"releaseUrl\": \"https://www.iausofa.org/2023-10-11c\",\n");
   printf("  \"archiveUrl\": \"https://www.iausofa.org/s/sofa_c-20231011tar.gz\",\n");
   printf("  \"retrievedArchiveSha256\": \"d9c10833cae8b4d9361a0ffda31ec361fd1262362025bec4d4e51a880150ace2\",\n");
   printf("  \"driver\": \"script/sofa_observer_effects_oracle.c --fixtures\",\n");
   printf("  \"assumptions\": {\n");
   printf("    \"inputFrame\": \"CIRS\",\n");
   printf("    \"horizontalAxes\": \"east,north,up\",\n");
   printf("    \"longitude\": \"east-positive geodetic radians\",\n");
   printf("    \"latitude\": \"WGS84 geodetic radians\",\n");
   printf("    \"polarMotionRadians\": [0, 0],\n");
   printf("    \"tioLocatorRadians\": 0,\n");
   printf("    \"refractionConstantsRadians\": [0, 0]\n");
   printf("  },\n");
   printf("  \"cases\": [\n");

   for (index = 0; index < count; index += 1) {
      const FixtureCase *fixture = &cases[index];
      const double theta = earth_rotation_angle(
         fixture->year,
         fixture->month,
         fixture->day,
         fixture->day_fraction
      );
      const double longitude =
         degrees_to_radians(fixture->longitude_degrees);
      const double latitude =
         degrees_to_radians(fixture->latitude_degrees);
      const double hour_angle =
         degrees_to_radians(fixture->hour_angle_degrees);
      const double declination =
         degrees_to_radians(fixture->declination_degrees);
      iauASTROM corrected = prepare_context(
         theta,
         longitude,
         latitude,
         fixture->height_meters,
         0.0,
         0.0,
         1
      );
      iauASTROM baseline = corrected;
      const double right_ascension = corrected.eral - hour_angle;
      EnuVector before;
      EnuVector after;
      baseline.diurab = 0.0;
      before = observed_enu(
         right_ascension,
         declination,
         &baseline
      );
      after = observed_enu(
         right_ascension,
         declination,
         &corrected
      );

      printf("    {\n");
      printf("      \"id\": \"%s\",\n", fixture->id);
      printf("      \"dateUt1\": \"%04d-%02d-%02dT%.12g\",\n",
             fixture->year,
             fixture->month,
             fixture->day,
             fixture->day_fraction);
      printf("      \"longitudeDegrees\": %.17g,\n",
             fixture->longitude_degrees);
      printf("      \"latitudeDegrees\": %.17g,\n",
             fixture->latitude_degrees);
      printf("      \"heightMeters\": %.17g,\n",
             fixture->height_meters);
      printf("      \"hourAngleDegrees\": %.17g,\n",
             fixture->hour_angle_degrees);
      printf("      \"declinationDegrees\": %.17g,\n",
             fixture->declination_degrees);
      printf("      \"diurnalAberrationMagnitude\": %.17g,\n",
             corrected.diurab);
      printf("      \"geometricHorizontalEnu\": [%.17g, %.17g, %.17g],\n",
             before.east, before.north, before.up);
      printf("      \"expectedHorizontalEnu\": [%.17g, %.17g, %.17g],\n",
             after.east, after.north, after.up);
      printf("      \"separationArcseconds\": %.17g\n",
             separation_arcseconds(before, after));
      printf("    }%s\n", index + 1 == count ? "" : ",");
   }

   printf("  ]\n");
   printf("}\n");
}

static void output_transformation_matrix(
   iauASTROM *astrom,
   double matrix[3][3]
)
{
   static const EnuVector basis[3] = {
      {1.0, 0.0, 0.0},
      {0.0, 1.0, 0.0},
      {0.0, 0.0, 1.0}
   };
   int column;
   for (column = 0; column < 3; column += 1) {
      double right_ascension;
      double declination;
      EnuVector output;
      cirs_from_vector(
         basis[column],
         &right_ascension,
         &declination
      );
      output = observed_enu(
         right_ascension,
         declination,
         astrom
      );
      matrix[0][column] = output.east;
      matrix[1][column] = output.north;
      matrix[2][column] = output.up;
   }
}

static EnuVector transpose_matrix_vector(
   double matrix[3][3],
   EnuVector vector
)
{
   EnuVector result = {
      matrix[0][0] * vector.east +
         matrix[1][0] * vector.north +
         matrix[2][0] * vector.up,
      matrix[0][1] * vector.east +
         matrix[1][1] * vector.north +
         matrix[2][1] * vector.up,
      matrix[0][2] * vector.east +
         matrix[1][2] * vector.north +
         matrix[2][2] * vector.up
   };
   return normalize_enu(result);
}

static double polar_motion_maximum(
   double theta,
   double longitude,
   double latitude,
   double xp,
   double yp
)
{
   iauASTROM baseline = prepare_context(
      theta, longitude, latitude, 0.0, 0.0, 0.0, 0
   );
   iauASTROM corrected = prepare_context(
      theta, longitude, latitude, 0.0, xp, yp, 0
   );
   double baseline_matrix[3][3];
   double corrected_matrix[3][3];
   double relative[3][3] = {{0.0}};
   EnuVector axis;
   EnuVector seed;
   EnuVector maximizing_baseline;
   EnuVector maximizing_cirs;
   EnuVector before;
   EnuVector after;
   double right_ascension;
   double declination;
   int row;
   int column;
   int inner;

   output_transformation_matrix(&baseline, baseline_matrix);
   output_transformation_matrix(&corrected, corrected_matrix);

   for (row = 0; row < 3; row += 1) {
      for (column = 0; column < 3; column += 1) {
         for (inner = 0; inner < 3; inner += 1) {
            relative[row][column] +=
               corrected_matrix[row][inner] *
               baseline_matrix[column][inner];
         }
      }
   }
   axis.east = relative[2][1] - relative[1][2];
   axis.north = relative[0][2] - relative[2][0];
   axis.up = relative[1][0] - relative[0][1];
   axis = normalize_enu(axis);

   if (fabs(axis.east) <= fabs(axis.north) &&
       fabs(axis.east) <= fabs(axis.up)) {
      seed = (EnuVector){1.0, 0.0, 0.0};
   } else if (fabs(axis.north) <= fabs(axis.up)) {
      seed = (EnuVector){0.0, 1.0, 0.0};
   } else {
      seed = (EnuVector){0.0, 0.0, 1.0};
   }
   maximizing_baseline = normalize_enu(cross_enu(axis, seed));
   maximizing_cirs = transpose_matrix_vector(
      baseline_matrix,
      maximizing_baseline
   );
   cirs_from_vector(
      maximizing_cirs,
      &right_ascension,
      &declination
   );
   before = observed_enu(
      right_ascension,
      declination,
      &baseline
   );
   after = observed_enu(
      right_ascension,
      declination,
      &corrected
   );
   return separation_arcseconds(before, after);
}

static double diurnal_aberration_maximum(
   double theta,
   double longitude,
   double latitude,
   double *magnitude
)
{
   iauASTROM corrected = prepare_context(
      theta, longitude, latitude, 0.0, 0.0, 0.0, 1
   );
   iauASTROM baseline = corrected;
   const double hour_angle = asin(corrected.diurab);
   const double right_ascension = corrected.eral - hour_angle;
   EnuVector before;
   EnuVector after;

   baseline.diurab = 0.0;
   before = observed_enu(right_ascension, 0.0, &baseline);
   after = observed_enu(right_ascension, 0.0, &corrected);
   *magnitude = corrected.diurab;
   return separation_arcseconds(before, after);
}

static void output_scan(void)
{
   const double longitude = degrees_to_radians(139.7671);
   const double tokyo_latitude = degrees_to_radians(35.6812);
   const double xp =
      EXTREME_XP_ARCSECONDS / ARCSECONDS_PER_RADIAN;
   const double yp =
      EXTREME_YP_ARCSECONDS / ARCSECONDS_PER_RADIAN;
   double djm0;
   double first_mjd;
   double end_mjd;
   double mjd;
   double tokyo_diurnal_max = 0.0;
   double tokyo_polar_max = 0.0;
   double global_diurnal_max = 0.0;
   double global_polar_max = 0.0;
   double global_diurnal_latitude = 0.0;
   double global_polar_latitude = 0.0;
   double tokyo_magnitude = 0.0;
   long date_samples = 0;
   long latitude_samples = 0;
   int year;
   int latitude_tenths;

   if (iauCal2jd(1900, 1, 1, &djm0, &first_mjd) != 0 ||
       iauCal2jd(2101, 1, 1, &djm0, &end_mjd) != 0) {
      fprintf(stderr, "Unable to construct scan dates\n");
      exit(EXIT_FAILURE);
   }

   for (mjd = first_mjd; mjd < end_mjd; mjd += 1.0) {
      const double theta = iauEra00(djm0, mjd);
      double magnitude;
      const double diurnal = diurnal_aberration_maximum(
         theta,
         longitude,
         tokyo_latitude,
         &magnitude
      );
      const double polar = polar_motion_maximum(
         theta,
         longitude,
         tokyo_latitude,
         xp,
         yp
      );
      if (diurnal > tokyo_diurnal_max) {
         tokyo_diurnal_max = diurnal;
         tokyo_magnitude = magnitude;
      }
      if (polar > tokyo_polar_max) {
         tokyo_polar_max = polar;
      }
      date_samples += 1;
   }

   for (year = 1900; year <= 2100; year += 1) {
      const double theta = earth_rotation_angle(
         year, 1, 1, 0.0
      );
      for (
         latitude_tenths = -900;
         latitude_tenths <= 900;
         latitude_tenths += 1
      ) {
         const double latitude_degrees =
            latitude_tenths / 10.0;
         const double latitude =
            degrees_to_radians(latitude_degrees);
         double magnitude;
         const double diurnal = diurnal_aberration_maximum(
            theta,
            longitude,
            latitude,
            &magnitude
         );
         const double polar = polar_motion_maximum(
            theta,
            longitude,
            latitude,
            xp,
            yp
         );
         if (diurnal > global_diurnal_max) {
            global_diurnal_max = diurnal;
            global_diurnal_latitude = latitude_degrees;
         }
         if (polar > global_polar_max) {
            global_polar_max = polar;
            global_polar_latitude = latitude_degrees;
         }
         latitude_samples += 1;
      }
   }

   printf("{\n");
   printf("  \"schemaVersion\": 1,\n");
   printf("  \"oracle\": \"IAU SOFA ANSI C 2023-10-11 unmodified apio/atioq\",\n");
   printf("  \"dateRangeUt1\": [\"1900-01-01\", \"2100-12-31\"],\n");
   printf("  \"dateSamplesAtTokyo\": %ld,\n", date_samples);
   printf("  \"latitudeRangeDegrees\": [-90, 90],\n");
   printf("  \"latitudeStepDegrees\": 0.1,\n");
   printf("  \"latitudeYearSamples\": %ld,\n", latitude_samples);
   printf("  \"wgs84HeightMeters\": 0,\n");
   printf("  \"tokyo\": {\n");
   printf("    \"latitudeDegrees\": 35.6812,\n");
   printf("    \"longitudeDegrees\": 139.7671,\n");
   printf("    \"diurnalAberrationMagnitude\": %.17g,\n",
          tokyo_magnitude);
   printf("    \"diurnalAberrationMaxArcseconds\": %.17g,\n",
          tokyo_diurnal_max);
   printf("    \"polarMotionEnvelopeMaxArcseconds\": %.17g\n",
          tokyo_polar_max);
   printf("  },\n");
   printf("  \"latitudeScan\": {\n");
   printf("    \"diurnalAberrationMaxArcseconds\": %.17g,\n",
          global_diurnal_max);
   printf("    \"diurnalAberrationLatitudeDegrees\": %.17g,\n",
          global_diurnal_latitude);
   printf("    \"polarMotionEnvelopeMaxArcseconds\": %.17g,\n",
          global_polar_max);
   printf("    \"polarMotionEnvelopeLatitudeDegrees\": %.17g\n",
          global_polar_latitude);
   printf("  },\n");
   printf("  \"polarMotionEnvelope\": {\n");
   printf("    \"source\": \"IERS finals2000A.all observed maximum vector\",\n");
   printf("    \"mjdUtc\": 50235,\n");
   printf("    \"xpArcseconds\": %.17g,\n",
          EXTREME_XP_ARCSECONDS);
   printf("    \"ypArcseconds\": %.17g,\n",
          EXTREME_YP_ARCSECONDS);
   printf("    \"magnitudeArcseconds\": %.17g\n",
          hypot(
             EXTREME_XP_ARCSECONDS,
             EXTREME_YP_ARCSECONDS
          ));
   printf("  }\n");
   printf("}\n");
}

int main(int argc, char **argv)
{
   if (argc != 2) {
      fprintf(stderr, "Usage: %s --fixtures|--scan\n", argv[0]);
      return EXIT_FAILURE;
   }
   if (strcmp(argv[1], "--fixtures") == 0) {
      output_fixtures();
      return EXIT_SUCCESS;
   }
   if (strcmp(argv[1], "--scan") == 0) {
      output_scan();
      return EXIT_SUCCESS;
   }
   fprintf(stderr, "Unknown mode: %s\n", argv[1]);
   return EXIT_FAILURE;
}
