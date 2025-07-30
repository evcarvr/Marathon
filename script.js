let map, directionsService, directionsRenderer, gpsMarker;
    let waypoints = [];
    let waypointMarkers = [];
    let fullPath = [];
    let cumDist = [];
    let totalDist = 0;
    let upcomingRouteBase, upcomingRoute, doneRouteBase, doneRoute;
    let startCircle, endCircle;
    let hasCenteredOnGPS = false;
    let navigationStarted = false;
    let lastProgressIndex = 0;
    let lastProgressTime = null;
    let lastProgressMeters = 0;
    let infoWindow = null;
let lastDeviationTime = 0;
    // Detect mode from URL param: "author" (default) or "follower"
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get("mode") || "author";
    const isAuthor = mode === "author";

    // On load, toggle UI buttons based on mode
//     window.onload = () => {
//       if (!isAuthor) {
//         // Disable editing controls for follower
// const controlsTop = document.getElementById("controls-top");
//     controlsTop.style.display = "none";

//     // Adjust the map margin-top so it fills the space at top
//     const mapElem = document.getElementById("map");
//     mapElem.style.marginTop = "0";
//         document.getElementById("clearBtn").style.display = "none";
//         document.getElementById("saveBtn").style.display = "none";
//         document.getElementById("loadBtn").style.display = "none";
//         document.getElementById("shareBtn").style.display = "none";
//         document.getElementById("shareLink").style.display = "none";

//       }
//     };


window.onload = () => {
  const controlsTop = document.getElementById("controls-top");
  const mapElem = document.getElementById("map");

  if (!isAuthor) {
    // Follower mode: hide top controls and remove top margin on map
    controlsTop.style.display = "none";
    mapElem.style.marginTop = "0";

    // Optional: redundant if controlsTop hidden, but no harm
    document.getElementById("clearBtn").style.display = "none";
    document.getElementById("saveBtn").style.display = "none";
    document.getElementById("loadBtn").style.display = "none";
    document.getElementById("shareBtn").style.display = "none";
    document.getElementById("shareLink").style.display = "none";
  } else {
    // Author mode: show top controls and set margin-top to reserve space
    controlsTop.style.display = "flex";
    mapElem.style.marginTop = "60px";
  }
};



    function createMarkerIcon(label, fillColor) {
      const svg = `
      <svg width="32" height="48" viewBox="0 0 32 48" xmlns="http://www.w3.org/2000/svg">
        <path fill="${fillColor}" stroke="white" stroke-width="2" d="M16 0c-7 0-12.7 5.7-12.7 12.7 0 9.5 12.7 35.3 12.7 35.3s12.7-25.8 12.7-35.3C28.7 5.7 23 0 16 0z"/>
        <text x="16" y="20" font-size="16" font-weight="bold" text-anchor="middle" fill="white" font-family="Arial" dominant-baseline="middle">${label}</text>
      </svg>
      `;
      return {
        url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
        scaledSize: new google.maps.Size(32, 48),
        labelOrigin: new google.maps.Point(16, 18)
      };
    }

    function initMap() {
      map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 12.93, lng: 77.61 },
        zoom: 15,
      });

      directionsService = new google.maps.DirectionsService();
      directionsRenderer = new google.maps.DirectionsRenderer({
        map,
        suppressMarkers: true,
        preserveViewport: true,
        polylineOptions: { strokeOpacity: 0 }
      });

      upcomingRouteBase = new google.maps.Polyline({
        map,
        strokeColor: "#ffffff",
        strokeOpacity: 1,
        strokeWeight: 10,
        zIndex: 1
      });

      upcomingRoute = new google.maps.Polyline({
        map,
        strokeColor: "#1A73E8",
        strokeOpacity: 1,
        strokeWeight: 6,
        zIndex: 2
      });

      doneRouteBase = new google.maps.Polyline({
        map,
        strokeColor: "#ffffff",
        strokeOpacity: 1,
        strokeWeight: 10,
        zIndex: 1
      });

      doneRoute = new google.maps.Polyline({
        map,
        strokeColor: "#9e9e9e",
        strokeOpacity: 1,
        strokeWeight: 6,
        zIndex: 2
      });

      if (isAuthor) {
        map.addListener("click", e => addWaypoint(e.latLng));
      }

      if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
          onPositionUpdate,
          err => console.error("Geolocation error", err),
          { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
        );
      }

      loadPointsFromURL();
    }

    function createMarker(latlng, index) {
      const marker = new google.maps.Marker({
        position: latlng,
        map,
        icon: createMarkerIcon(index + 1, "#FF0000"),
        draggable: isAuthor,
      });

      marker.note = ""; // store popup text

      if (isAuthor) {
        marker.addListener("click", () => {
          if (infoWindow) infoWindow.close();

          const inputId = `noteInput-${index}`;
         const content = `
  <div style="max-width: 260px; padding: 10px; background: #f8f9fa; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); font-family: 'Segoe UI', sans-serif; font-size: 18px;">
    <label style="font-weight:600; color: #333;">Waypoint Note:</label><br>
    <textarea id="${inputId}" rows="4" style="width: 100%; padding: 8px; font-size: 16px; border-radius: 6px; border: 1px solid #ccc;"></textarea><br/><br/>
    <button style="background: #007bff; color: white; border: none; padding: 10px 16px; font-size: 14px; border-radius: 6px; cursor: pointer;" onclick="saveNote(${index}, '${inputId}')">Save</button>
  </div>
`;

          infoWindow = new google.maps.InfoWindow({
            content: content
          });

          infoWindow.open(map, marker);
        });

        marker.addListener("dblclick", () => {
          const idx = waypointMarkers.findIndex(obj => obj.marker === marker);
          if (idx !== -1) deleteWaypoint(idx);
        });

        marker.addListener("dragend", () => {
          const idx = waypointMarkers.findIndex(obj => obj.marker === marker);
          if (idx !== -1) {
            waypoints[idx] = marker.getPosition();
            updateRoute();
          }
        });
      } else {
        // Follower: show author's note only, no close button, infoWindow closes on outside click
        marker.addListener("click", () => {
          if (infoWindow) infoWindow.close();

          if (!marker.note) return; // no popup if no note

const content = `
  <div style="
    max-width: 300px;
    padding: 16px;
    background: linear-gradient(135deg, #e0f7fa, #b2ebf2);
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    font-family: 'Segoe UI', sans-serif;
    font-size: 18px;
    font-weight: bold;
    color: #004d40;
    text-align: center;
    line-height: 1.5;
    word-wrap: break-word;
  ">
    ${escapeHtml(marker.note).replace(/\n/g, "<br>")}
  </div>
`;


          infoWindow = new google.maps.InfoWindow({
            content: content
          });

          infoWindow.open(map, marker);
        });
      }

      return marker;
    }

    // Only author can add via map clicks
    function addWaypoint(latlng) {
      if (!isAuthor) return;
      waypoints.push(latlng);
      const marker = createMarker(latlng, waypoints.length - 1);
      waypointMarkers.push({ marker, crossed: false });
      updateRoute();
    }

    // For loading waypoints (both author & follower), bypass author check
    // function addWaypointDirect(latlng) {
    //   waypoints.push(latlng);
    //   const marker = createMarker(latlng, waypoints.length - 1);
    //   waypointMarkers.push({ marker, crossed: false });
    //   updateRoute();
    // }
function addWaypointDirect(latlng, suppressUpdate = false) {
  waypoints.push(latlng);
  const marker = createMarker(latlng, waypoints.length - 1);
  waypointMarkers.push({ marker, crossed: false });
  if (!suppressUpdate) {
    updateRoute();
  }
}

    function deleteWaypoint(index) {
      if (!isAuthor) return;
      waypointMarkers[index].marker.setMap(null);
      waypointMarkers.splice(index, 1);
      waypoints.splice(index, 1);
      relabelMarkers();
      updateRoute();
    }

    function relabelMarkers() {
      waypointMarkers.forEach((obj, i) => {
        obj.marker.setIcon(createMarkerIcon(i + 1, obj.crossed ? "#00c853" : "#FF0000"));
      });
    }

    function saveNote(index, inputId) {
      const input = document.getElementById(inputId);
      if (input) {
        const note = input.value.trim();
        waypointMarkers[index].marker.note = note;
        alert("Note saved for waypoint " + (index + 1));
        if (infoWindow) infoWindow.close();
      }
    }

    function updateRoute() {
      if (waypoints.length < 2) {
        directionsRenderer.setDirections({ routes: [] });
        resetPathState();
        resetNavigation();
        return;
      }
      calculateRoute();
    }
let alertShown = false;

function showRouteAlert() {
  if (!alertShown) {
    document.getElementById("routeAlertPopup").style.display = "flex";
    alertShown = true;
  }
}

function hideRouteAlert() {
  document.getElementById("routeAlertPopup").style.display = "none";
  alertShown = false;
}

    function calculateRoute() {
      const origin = waypoints[0];
      const destination = waypoints[waypoints.length - 1];
      const midpoints = waypoints.slice(1, -1).map(loc => ({ location: loc, stopover: true }));

      const request = {
        origin,
        destination,
        waypoints: midpoints,
        travelMode: google.maps.TravelMode.DRIVING
      };

      directionsService.route(request, (result, status) => {
        if (status !== "OK") {
          alert("Directions request failed due to " + status);
          return;
        }

        directionsRenderer.setDirections(result);

        fullPath = [];
        const route = result.routes[0];
        route.legs.forEach(leg => {
          leg.steps.forEach(step => {
            step.path.forEach(pt => fullPath.push(pt));
          });
        });

        cumDist = [0];
        for (let i = 1; i < fullPath.length; i++) {
          const d = google.maps.geometry.spherical.computeDistanceBetween(fullPath[i - 1], fullPath[i]);
          cumDist.push(cumDist[i - 1] + d);
        }
        totalDist = cumDist[cumDist.length - 1];

        doneRoute.setPath([]);
        doneRouteBase.setPath([]);
        upcomingRoute.setPath(fullPath);
        upcomingRouteBase.setPath(fullPath);

        if (startCircle) startCircle.setMap(null);
        if (endCircle) endCircle.setMap(null);

        startCircle = new google.maps.Marker({
          position: fullPath[0],
          map,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#4CAF50",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2
          }
        });

        endCircle = new google.maps.Marker({
          position: fullPath[fullPath.length - 1],
          map,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#F44336",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2
          }
        });

        lastProgressIndex = 0;
        lastProgressTime = null;
        lastProgressMeters = 0;

        hideProgressBar();
        resetNavigation();
      });
    }

    function onPositionUpdate(pos) {
      const currentPos = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);

      if (!gpsMarker) {
        gpsMarker = new google.maps.Marker({
          position: currentPos,
          map,
          zIndex: 999,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: "#1A73E8",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2
          }
        });
      } else {
        gpsMarker.setPosition(currentPos);
      }

      if (!hasCenteredOnGPS) {
        map.setCenter(currentPos);
        map.setZoom(17);
        hasCenteredOnGPS = true;
      }

      if (!navigationStarted) {
        checkStartButton(currentPos);
      } else {
        updateSmoothProgress(currentPos);
      }
    }

    function checkStartButton(currentPos) {
      const btn = document.getElementById("startNavBtn");
      if (waypoints.length === 0) { btn.disabled = true; return; }
      const start = waypoints[0];
      const dist = google.maps.geometry.spherical.computeDistanceBetween(currentPos, start);
      btn.disabled = dist > 30 || fullPath.length === 0;
    }

    function startNavigation() {
      if (!fullPath.length) {
        alert("Create a route first.");
        return;
      }
      navigationStarted = true;
      lastProgressIndex = 0;
      lastProgressTime = Date.now();
      lastProgressMeters = 0;
      doneRoute.setPath([]);
      doneRouteBase.setPath([]);
      upcomingRoute.setPath(fullPath);
      upcomingRouteBase.setPath(fullPath);
      document.getElementById("startNavBtn").disabled = true;
      showProgressBar();
      updateProgressUI(0, totalDist);
    }

    function updateSmoothProgress(currentPos) {
      if (!fullPath.length) return;

      const searchStart = Math.max(lastProgressIndex - 5, 0);
      let best = { dist: Infinity, segIndex: -1, projPoint: null, projRatio: 0, cumMetersAtProj: 0 };

      for (let i = searchStart; i < fullPath.length - 1; i++) {
        const a = fullPath[i];
        const b = fullPath[i + 1];

        const proj = projectPointOnSegment(currentPos, a, b);
        if (!proj) continue;

        const d = google.maps.geometry.spherical.computeDistanceBetween(currentPos, proj.point);
        if (d < best.dist) {
          best.dist = d;
          best.segIndex = i;
          best.projPoint = proj.point;
          best.projRatio = proj.t;
          const distToA = cumDist[i];
          const segLen = google.maps.geometry.spherical.computeDistanceBetween(a, b);
          best.cumMetersAtProj = distToA + segLen * proj.t;
        }
      }

      if (best.segIndex === -1) return;

      const donePts = fullPath.slice(0, best.segIndex + 1).concat([best.projPoint]);
      const futurePts = [best.projPoint].concat(fullPath.slice(best.segIndex + 1));

      doneRoute.setPath(donePts);
      doneRouteBase.setPath(donePts);
      upcomingRoute.setPath(futurePts);
      upcomingRouteBase.setPath(futurePts);

      lastProgressIndex = Math.max(lastProgressIndex, best.segIndex);

      const doneMeters = best.cumMetersAtProj;
      const remain = Math.max(0, totalDist - doneMeters);
      const pct = totalDist > 0 ? (doneMeters / totalDist) * 100 : 0;
      updateProgressUI(pct, remain);

      // waypoints.forEach((wp, i) => {
      //   if (!waypointMarkers[i].crossed) {
      //     const wpIndex = fullPath.findIndex(p => google.maps.geometry.spherical.computeDistanceBetween(p, wp) < 5);
      //     if (wpIndex !== -1 && wpIndex <= best.segIndex) {
      //       waypointMarkers[i].crossed = true;
      //       waypointMarkers[i].marker.setIcon(createMarkerIcon(i + 1, "#00c853")); // turn green
      //     }
      //   }
      // });
      waypoints.forEach((wp, i) => {
  if (!waypointMarkers[i].crossed) {
    const wpIndex = fullPath.findIndex(p => google.maps.geometry.spherical.computeDistanceBetween(p, wp) < 5);

    // Also check against the projected point if this is the final waypoint
    const isLast = i === waypoints.length - 1;
    const nearProjected = google.maps.geometry.spherical.computeDistanceBetween(best.projPoint, wp) < 5;

    if ((wpIndex !== -1 && wpIndex <= best.segIndex) || (isLast && nearProjected)) {
      waypointMarkers[i].crossed = true;
      waypointMarkers[i].marker.setIcon(createMarkerIcon(i + 1, "#00c853")); // turn green
    }
  }
});

// --- Deviation Alert Logic ---
const distanceFromPath = best.dist; // already calculated

  const now = Date.now();
  const offRoute = distanceFromPath > 30; // meters

  if (offRoute && now - lastDeviationTime > 6000) {
    showRouteAlert();
    lastDeviationTime = now;
  }
    }

    function projectPointOnSegment(p, a, b) {
      const ax = a.lng(), ay = a.lat();
      const bx = b.lng(), by = b.lat();
      const px = p.lng(), py = p.lat();

      const abx = bx - ax;
      const aby = by - ay;
      const apx = px - ax;
      const apy = py - ay;

      const ab2 = abx * abx + aby * aby;
      if (ab2 === 0) return null;

      let t = (apx * abx + apy * aby) / ab2;
      t = Math.max(0, Math.min(1, t));

      const qx = ax + abx * t;
      const qy = ay + aby * t;

      return { point: new google.maps.LatLng(qy, qx), t };
    }

    function showProgressBar() {
      document.getElementById("progressBarWrapper").style.display = "block";
    }
    function hideProgressBar() {
      document.getElementById("progressBarWrapper").style.display = "none";
    }

    function updateProgressUI(percent, remainingMeters) {
      const pctRounded = Math.min(100, Math.max(0, percent)).toFixed(1);
      document.getElementById("progressInner").style.width = pctRounded + "%";
      document.getElementById("progressText").textContent = `${pctRounded}% • ${formatDistance(remainingMeters)} left`;

      if (lastProgressTime == null) {
        lastProgressTime = Date.now();
        lastProgressMeters = totalDist - remainingMeters;
        document.getElementById("etaText").textContent = "";
        return;
      }

      const now = Date.now();
      const elapsedSec = (now - lastProgressTime) / 1000;
      if (elapsedSec < 3) return; // only update ETA every 3s

      const currentMetersDone = totalDist - remainingMeters;
      const metersMoved = currentMetersDone - lastProgressMeters;

      if (metersMoved <= 0) return;

      const speedMps = metersMoved / elapsedSec;
      const etaSeconds = remainingMeters / speedMps;

      const etaStr = formatTimeDuration(etaSeconds);
      document.getElementById("etaText").textContent = `ETA: ${etaStr}`;

      lastProgressTime = now;
      lastProgressMeters = currentMetersDone;
    }

    function formatDistance(meters) {
      if (meters >= 1000) return (meters / 1000).toFixed(2) + " km";
      return meters.toFixed(0) + " m";
    }

    function formatTimeDuration(seconds) {
      if (seconds < 60) return `${Math.round(seconds)} sec`;
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${mins} min ${secs} sec`;
    }

    function resetNavigation() {
      navigationStarted = false;
      document.getElementById("startNavBtn").disabled = waypoints.length < 2;
      hideProgressBar();
      doneRoute.setPath([]);
      doneRouteBase.setPath([]);
      upcomingRoute.setPath(fullPath);
      upcomingRouteBase.setPath(fullPath);
      waypointMarkers.forEach(obj => {
        obj.crossed = false;
        obj.marker.setIcon(createMarkerIcon(waypointMarkers.indexOf(obj) + 1, "#FF0000"));
      });
    }

    function clearRoute() {
      if (!isAuthor) return;
      waypoints = [];
      waypointMarkers.forEach(obj => obj.marker.setMap(null));
      waypointMarkers = [];
      directionsRenderer.setDirections({ routes: [] });
      resetNavigation();
      resetPathState();
      document.getElementById("startNavBtn").disabled = true;
    }

    function resetPathState() {
      fullPath = [];
      cumDist = [];
      totalDist = 0;
      if (startCircle) { startCircle.setMap(null); startCircle = null; }
      if (endCircle) { endCircle.setMap(null); endCircle = null; }
    }

    function savePath() {
      if (!isAuthor) return;
      if (waypoints.length < 2) {
        alert("Add at least 2 waypoints to save.");
        return;
      }
        //updateRoute();  // <-- ADD THIS

      const coords = waypoints.map(wp => [wp.lat(), wp.lng()]);
      const notes = waypointMarkers.map(obj => obj.marker.note || "");
      const data = JSON.stringify({ coords, notes });
      localStorage.setItem("savedPath", data);
      alert("Path saved locally.");
    }

    function loadSavedPath() {
      if (!isAuthor) return;
      const data = localStorage.getItem("savedPath");
      if (!data) {
        alert("No saved path found.");
        return;
      }

      try {
        const obj = JSON.parse(data);
        if (!obj.coords) throw new Error("Invalid saved data");
        clearRoute();
            obj.coords.forEach(c => addWaypointDirect(new google.maps.LatLng(c[0], c[1]), true));

        // obj.coords.forEach(c => addWaypointDirect(new google.maps.LatLng(c[0], c[1])));
        if (obj.notes && obj.notes.length === waypointMarkers.length) {
          for (let i = 0; i < obj.notes.length; i++) {
            waypointMarkers[i].marker.note = obj.notes[i];
          }
        }
        alert("Saved path loaded.");
      } catch (e) {
        alert("Failed to load saved path: " + e.message);
      }
              updateRoute();  // <-- ADD THIS

    }

    // Generate a shareable URL with coordinates and notes
    function generateShareLink() {
      if (!isAuthor) return;
      if (waypoints.length < 2) {
        alert("Add at least 2 waypoints to share.");
        return;
      }
        updateRoute();  // <-- ADD THIS

      const coords = waypoints.map(wp => `${wp.lat()},${wp.lng()}`).join(";");
      const notes = waypointMarkers.map(obj => obj.marker.note || "");
      const notesJson = encodeURIComponent(JSON.stringify(notes));
      const baseUrl = window.location.href.split("?")[0];
      const link = `${baseUrl}?points=${encodeURIComponent(coords)}&notes=${notesJson}&mode=follower`;
      const shareInput = document.getElementById("shareLink");
      shareInput.value = link;
      shareInput.select();
      alert("Shareable link generated! Send this link to followers.");
    }

    // Load points and notes from URL for both modes
    function loadPointsFromURL() {
      const pointsParam = urlParams.get("points");
      const notesParam = urlParams.get("notes");
      if (!pointsParam) return;

      clearRoute();

      const coords = pointsParam.split(";").map(s => {
        const [lat, lng] = s.split(",").map(Number);
        return new google.maps.LatLng(lat, lng);
      });

      let notes = [];
      if (notesParam) {
        try {
          notes = JSON.parse(decodeURIComponent(notesParam));
        } catch (e) {
          console.warn("Failed to parse notes JSON", e);
        }
      }

      coords.forEach((c, i) => {
        addWaypointDirect(c,true);
        if (notes[i]) {
          waypointMarkers[i].marker.note = notes[i];
        }
      });
updateRoute();  // <-- add here as well

      document.getElementById("startNavBtn").disabled = coords.length < 2;
    }

    // Utility: Escape HTML to prevent injection in follower popups
    function escapeHtml(text) {
      return text.replace(/[&<>"']/g, function(m) {
        return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[m];
      });
    }
    
