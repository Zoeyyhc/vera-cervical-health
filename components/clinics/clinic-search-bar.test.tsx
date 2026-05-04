import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClinicSearchBar } from "./clinic-search-bar";

const baseProps = {
  keyword: "",
  location: "",
  onKeywordChange: vi.fn(),
  onLocationChange: vi.fn(),
  onSearch: vi.fn(),
};

function stubGeolocation(value: unknown) {
  Object.defineProperty(navigator, "geolocation", {
    value,
    configurable: true,
  });
}

describe("ClinicSearchBar geolocation", () => {
  let originalGeo: Geolocation | undefined;

  beforeEach(() => {
    originalGeo = navigator.geolocation;
  });

  afterEach(() => {
    stubGeolocation(originalGeo);
    vi.clearAllMocks();
  });

  it("hides the geo button when navigator.geolocation is unavailable", async () => {
    stubGeolocation(undefined);
    render(<ClinicSearchBar {...baseProps} />);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /use my location/i })).toBeNull();
    });
  });

  it("on granted: pre-fills location and reports coords to onLocationDetected", () => {
    const onLocationChange = vi.fn();
    const onLocationDetected = vi.fn();
    const onSearch = vi.fn();
    stubGeolocation({
      getCurrentPosition: (success: PositionCallback) => {
        success({
          coords: {
            latitude: -33.8688,
            longitude: 151.2093,
            accuracy: 0,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        } as GeolocationPosition);
      },
    });
    render(
      <ClinicSearchBar
        {...baseProps}
        onLocationChange={onLocationChange}
        onLocationDetected={onLocationDetected}
        onSearch={onSearch}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /use my location/i }));
    expect(onLocationChange).toHaveBeenCalledWith("-33.8688,151.2093");
    expect(onLocationDetected).toHaveBeenCalledWith({ lat: -33.8688, lng: 151.2093 });
  });

  it("on denied (error code 1): shows the inline denied message", async () => {
    stubGeolocation({
      getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback) => {
        error?.({
          code: 1,
          message: "denied",
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError);
      },
    });
    render(<ClinicSearchBar {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /use my location/i }));
    expect(await screen.findByText(/location permission was denied/i)).toBeInTheDocument();
  });

  it("on other error codes: stays in idle state and does not show the denied message", async () => {
    stubGeolocation({
      getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback) => {
        error?.({
          code: 2,
          message: "position unavailable",
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError);
      },
    });
    render(<ClinicSearchBar {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /use my location/i }));
    // The denied inline message must not appear for non-PERMISSION_DENIED errors.
    expect(screen.queryByText(/location permission was denied/i)).toBeNull();
    // Button still visible and clickable for retry.
    expect(screen.getByRole("button", { name: /use my location/i })).toBeInTheDocument();
  });
});
