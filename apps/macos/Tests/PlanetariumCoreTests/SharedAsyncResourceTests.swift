import Foundation
import XCTest

@testable import Planetarium

final class SharedAsyncResourceTests:
    XCTestCase, @unchecked Sendable
{
    func testConcurrentColdCallersShareOneLoad()
        async throws
    {
        let counter = AsyncLoadCounter()
        let resource = SharedAsyncResource {
            await counter.increment()
            try await Task.sleep(
                for: .milliseconds(40)
            )
            return 42
        }

        async let first = resource.value()
        async let second = resource.value()
        async let third = resource.value()

        let values = try await [first, second, third]
        XCTAssertEqual(values, [42, 42, 42])
        let loadCountAfterColdCalls = await counter.value
        XCTAssertEqual(loadCountAfterColdCalls, 1)

        let cached = try await resource.value()
        let finalLoadCount = await counter.value
        XCTAssertEqual(cached, 42)
        XCTAssertEqual(
            finalLoadCount,
            1,
            "成功値は以後の年切替でも再利用する"
        )
    }

    func testCancelledWaiterDoesNotCancelSharedLoad()
        async throws
    {
        let counter = AsyncLoadCounter()
        let resource = SharedAsyncResource {
            await counter.increment()
            try await Task.sleep(
                for: .milliseconds(80)
            )
            return "ready"
        }
        let cancelledWaiter = Task {
            try await resource.value()
        }
        let survivingWaiter = Task {
            try await resource.value()
        }

        try await Task.sleep(for: .milliseconds(10))
        cancelledWaiter.cancel()

        do {
            _ = try await cancelledWaiter.value
            XCTFail("cancelled waiter must observe cancellation")
        } catch is CancellationError {
            // Expected. The underlying unstructured load remains shared.
        }
        let survivingValue = try await survivingWaiter.value
        let loadCountAfterCancellation =
            await counter.value
        let cached = try await resource.value()
        let finalLoadCount = await counter.value
        XCTAssertEqual(survivingValue, "ready")
        XCTAssertEqual(loadCountAfterCancellation, 1)
        XCTAssertEqual(cached, "ready")
        XCTAssertEqual(finalLoadCount, 1)
    }

    func testFailedLoadIsRemovedAndRetried()
        async throws
    {
        let counter = AsyncLoadCounter()
        let resource = SharedAsyncResource {
            let attempt = await counter.increment()
            if attempt == 1 {
                throw TestLoadError.firstAttempt
            }
            return attempt
        }

        do {
            _ = try await resource.value()
            XCTFail("first attempt must fail")
        } catch TestLoadError.firstAttempt {
            // Expected.
        }

        let retryValue = try await resource.value()
        let cachedValue = try await resource.value()
        let finalLoadCount = await counter.value
        XCTAssertEqual(retryValue, 2)
        XCTAssertEqual(cachedValue, 2)
        XCTAssertEqual(finalLoadCount, 2)
    }

    func testCancelledSharedLoadIsRemovedAndRetried()
        async throws
    {
        let counter = AsyncLoadCounter()
        let resource = SharedAsyncResource {
            let attempt = await counter.increment()
            if attempt == 1 {
                throw CancellationError()
            }
            return attempt
        }

        do {
            _ = try await resource.value()
            XCTFail("cancelled shared load must fail")
        } catch is CancellationError {
            // Expected. The cancelled in-flight entry must be removed.
        }

        let retryValue = try await resource.value()
        let finalLoadCount = await counter.value
        XCTAssertEqual(retryValue, 2)
        XCTAssertEqual(finalLoadCount, 2)
    }
}

private actor AsyncLoadCounter {
    private(set) var value = 0

    @discardableResult
    func increment() -> Int {
        value += 1
        return value
    }
}

private enum TestLoadError: Error {
    case firstAttempt
}
