/// Optional source-native astrometry appended by the v2 bright-star catalog.
/// Legacy v1 rows have no value for this property.
public struct StarAstrometry: Hashable, Sendable {
    /// μᵅ cos(δ), in arcseconds per Julian year.
    public let properMotionRightAscensionCosDeclinationArcsecondsPerYear: Double?
    /// μδ, in arcseconds per Julian year.
    public let properMotionDeclinationArcsecondsPerYear: Double?
    public let parallaxArcseconds: Double?
    public let radialVelocityKilometersPerSecond: Double?

    public init(
        properMotionRightAscensionCosDeclinationArcsecondsPerYear: Double?,
        properMotionDeclinationArcsecondsPerYear: Double?,
        parallaxArcseconds: Double? = nil,
        radialVelocityKilometersPerSecond: Double? = nil
    ) {
        self.properMotionRightAscensionCosDeclinationArcsecondsPerYear =
            properMotionRightAscensionCosDeclinationArcsecondsPerYear
        self.properMotionDeclinationArcsecondsPerYear =
            properMotionDeclinationArcsecondsPerYear
        self.parallaxArcseconds = parallaxArcseconds
        self.radialVelocityKilometersPerSecond =
            radialVelocityKilometersPerSecond
    }

    public var hasProperMotion: Bool {
        properMotionRightAscensionCosDeclinationArcsecondsPerYear != nil
            || properMotionDeclinationArcsecondsPerYear != nil
    }
}
