import TrackingModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const TRACKING_MODULE = "tracking"

export default Module(TRACKING_MODULE, {
  service: TrackingModuleService,
})
