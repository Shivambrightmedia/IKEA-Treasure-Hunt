/**
 * MindAR Marker Handler Component
 * Detects marker found/lost events and sends them to Unity
 */
AFRAME.registerComponent("marker-handler", {
    schema: {
        markerId: { type: "string", default: "" }
    },

    init() {
        const markerId = this.data.markerId;

        // Marker detected in camera view
        this.el.addEventListener("targetFound", () => {
            // console.log(`[WebAR] Marker FOUND: ${markerId}`);
            sendMarkerEventToUnity(markerId, "found");
        });

        // Marker lost from camera view
        this.el.addEventListener("targetLost", () => {
            // console.log(`[WebAR] Marker LOST: ${markerId}`);
            sendMarkerEventToUnity(markerId, "lost");
        });
    }
});

/**
 * Scene ready handler - called when MindAR is fully initialized
 */
document.addEventListener("DOMContentLoaded", () => {
    const scene = document.querySelector("a-scene");

    if (scene) {
        scene.addEventListener("arReady", () => {
            // console.log("[WebAR] AR scene is ready");
            notifyUnityARReady();
        });

        scene.addEventListener("arError", (event) => {
            console.error("[WebAR] AR error:", event.detail);
        });
    }
});

// password supabase : Shivam@brightmedia
