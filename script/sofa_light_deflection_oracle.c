/*
 * Independent oracle driver for Planetarium's solar-light-deflection audit.
 *
 * This original glue program only calls iauLdsun from an unmodified IAU SOFA
 * ANSI C 2023-10-11 release. It does not contain or adapt the SOFA algorithm.
 * Build it against the official release from:
 *
 *   https://www.iausofa.org/2023-10-11c
 *
 * The first case reproduces the official t_sofa_c.c ldsun regression vector.
 * The remaining cases exercise the documented limiter on both sides of its
 * threshold, the exact solar-center limit, ordinary geometry, and a distant
 * observer. Outputs are the raw iauLdsun vectors; SOFA ld documents that it
 * does not explicitly normalize its result.
 *
 * This driver is not software provided by or endorsed by the IAU SOFA Board.
 * When distributing SOFA itself, its complete license continues to apply.
 */

#include <math.h>
#include <sofa.h>
#include <stdio.h>

typedef struct {
   const char *id;
   const char *provenance;
   double direction[3];
   double sun_to_observer[3];
   double distance_au;
} FixtureCase;

static void print_vector(const double vector[3])
{
   printf(
      "[%.17g, %.17g, %.17g]",
      vector[0],
      vector[1],
      vector[2]
   );
}

int main(void)
{
   const double below_angle = 0.0005;
   const double above_angle = 0.002;
   const double distant_angle = 0.0001;
   const FixtureCase cases[] = {
      {
         "official-t-sofa-c-ldsun",
         "official-t_sofa_c.c",
         {-0.763276255, -0.608633767, -0.216735543},
         {-0.973644023, -0.20925523, -0.0907169552},
         0.999809214
      },
      {
         "orthogonal-one-au",
         "independent-unmodified-iauLdsun-driver",
         {0.0, 1.0, 0.0},
         {1.0, 0.0, 0.0},
         1.0
      },
      {
         "exact-solar-center-one-au",
         "independent-unmodified-iauLdsun-driver",
         {-1.0, 0.0, 0.0},
         {1.0, 0.0, 0.0},
         1.0
      },
      {
         "below-limiter-one-au",
         "independent-unmodified-iauLdsun-driver",
         {-cos(below_angle), sin(below_angle), 0.0},
         {1.0, 0.0, 0.0},
         1.0
      },
      {
         "above-limiter-one-au",
         "independent-unmodified-iauLdsun-driver",
         {-cos(above_angle), sin(above_angle), 0.0},
         {1.0, 0.0, 0.0},
         1.0
      },
      {
         "below-limiter-ten-au",
         "independent-unmodified-iauLdsun-driver",
         {-cos(distant_angle), sin(distant_angle), 0.0},
         {1.0, 0.0, 0.0},
         10.0
      }
   };
   const size_t count = sizeof(cases) / sizeof(cases[0]);
   size_t index;

   printf("{\n");
   printf("  \"schemaVersion\": 1,\n");
   printf(
      "  \"oracle\": \"IAU SOFA ANSI C 2023-10-11 unmodified ldsun/ld\",\n"
   );
   printf(
      "  \"releaseUrl\": \"https://www.iausofa.org/2023-10-11c\",\n"
   );
   printf(
      "  \"archiveUrl\": \"https://www.iausofa.org/s/sofa_c-20231011tar.gz\",\n"
   );
   printf(
      "  \"retrievedArchiveSha256\": "
      "\"d9c10833cae8b4d9361a0ffda31ec361fd1262362025bec4d4e51a880150ace2\",\n"
   );
   printf(
      "  \"officialTestProgramSha256\": "
      "\"87ec88eac0be306a7060f984af2f1506ade2148332ea9ec70922eb3bf39b382d\",\n"
   );
   printf(
      "  \"ldSourceSha256\": "
      "\"8d4c081851c780e359ba2a281e246b2a6bea0a68622a67f017bfd623ba49a5dd\",\n"
   );
   printf(
      "  \"ldsunSourceSha256\": "
      "\"99d4bea0f3059e8632d2d315e4d538718a756dd7d379d4e27c76420a85316d70\",\n"
   );
   printf(
      "  \"driver\": \"script/sofa_light_deflection_oracle.c\",\n"
   );
   printf(
      "  \"expectedVectors\": "
      "\"raw iauLdsun output; normalized by Planetarium tests before comparison\",\n"
   );
   printf("  \"cases\": [\n");
   for (index = 0; index < count; index++) {
      double expected[3];
      iauLdsun(
         (double *)cases[index].direction,
         (double *)cases[index].sun_to_observer,
         cases[index].distance_au,
         expected
      );
      printf("    {\n");
      printf("      \"id\": \"%s\",\n", cases[index].id);
      printf(
         "      \"provenance\": \"%s\",\n",
         cases[index].provenance
      );
      printf("      \"naturalDirection\": ");
      print_vector(cases[index].direction);
      printf(",\n");
      printf("      \"sunToObserverUnitDirection\": ");
      print_vector(cases[index].sun_to_observer);
      printf(",\n");
      printf(
         "      \"sunObserverDistanceAu\": %.17g,\n",
         cases[index].distance_au
      );
      printf("      \"expectedDeflectedDirection\": ");
      print_vector(expected);
      printf("\n    }%s\n", index + 1 == count ? "" : ",");
   }
   printf("  ]\n");
   printf("}\n");
   return 0;
}
