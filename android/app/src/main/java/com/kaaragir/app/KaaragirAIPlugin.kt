package com.kaaragir.app

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "KaaragirAI")
class KaaragirAIPlugin : Plugin() {

    @PluginMethod
    fun getDeviceCapabilities(call: PluginCall) {
        val ret = JSObject()
        ret.put("bridgeConnected", true)
        ret.put("platform", "android")
        ret.put("architecture", System.getProperty("os.arch") ?: "unknown")
        ret.put("deviceModel", android.os.Build.MODEL)
        ret.put("androidVersion", android.os.Build.VERSION.RELEASE)
        ret.put("runtime", "test")
        ret.put("npuAvailable", false)
        ret.put("gpuAvailable", false)
        call.resolve(ret)
    }

    @PluginMethod
    fun analyzeImageAndText(call: PluginCall) {
        val text = call.getString("text")
        val imageUri = call.getString("imageUri")
        
        // This is a test response conforming to CraftSpecification
        val spec = JSObject()
        spec.put("product", "Dining Table")
        spec.put("material", "Sagwan Teak")
        spec.put("length_ft", 6.0)
        spec.put("seating_capacity", 6)
        
        val features = org.json.JSONArray()
        features.put("Carved Legs")
        features.put("Brass Inlay")
        spec.put("features", features)
        
        val ret = JSObject()
        ret.put("success", true)
        ret.put("specification", spec)
        ret.put("debug_text_received", text)
        ret.put("debug_image_received", imageUri)
        
        call.resolve(ret)
    }

    @PluginMethod
    fun transcribeAudio(call: PluginCall) {
        val audioUri = call.getString("audioUri")
        val ret = JSObject()
        ret.put("success", true)
        ret.put("transcript", "I want a six feet Sagwan teak dining table for six people with carved legs and brass inlay.")
        ret.put("debug_audio_received", audioUri)
        
        call.resolve(ret)
    }
}
