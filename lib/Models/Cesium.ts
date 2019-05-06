import { autorun } from 'mobx';
import { createTransformer } from 'mobx-utils';
import BoundingSphere from 'terriajs-cesium/Source/Core/BoundingSphere';
import Cartesian2 from 'terriajs-cesium/Source/Core/Cartesian2';
import Cartesian3 from 'terriajs-cesium/Source/Core/Cartesian3';
import Cartographic from 'terriajs-cesium/Source/Core/Cartographic';
import defaultValue from 'terriajs-cesium/Source/Core/defaultValue';
import defined from 'terriajs-cesium/Source/Core/defined';
import Ellipsoid from 'terriajs-cesium/Source/Core/Ellipsoid';
import HeadingPitchRange from 'terriajs-cesium/Source/Core/HeadingPitchRange';
import CesiumMath from 'terriajs-cesium/Source/Core/Math';
import Matrix4 from 'terriajs-cesium/Source/Core/Matrix4';
import PerspectiveFrustum from 'terriajs-cesium/Source/Core/PerspectiveFrustum';
import Rectangle from 'terriajs-cesium/Source/Core/Rectangle';
import sampleTerrain from 'terriajs-cesium/Source/Core/sampleTerrain';
import Transforms from 'terriajs-cesium/Source/Core/Transforms';
import BoundingSphereState from 'terriajs-cesium/Source/DataSources/BoundingSphereState';
import DataSource from 'terriajs-cesium/Source/DataSources/DataSource';
import DataSourceCollection from "terriajs-cesium/Source/DataSources/DataSourceCollection";
import ImageryLayer from 'terriajs-cesium/Source/Scene/ImageryLayer';
import Scene from 'terriajs-cesium/Source/Scene/Scene';
import when from 'terriajs-cesium/Source/ThirdParty/when';
import CesiumWidget from 'terriajs-cesium/Source/Widgets/CesiumWidget/CesiumWidget';
import isDefined from '../Core/isDefined';
import pollToPromise from '../Core/pollToPromise';
import CesiumRenderLoopPauser from '../Map/CesiumRenderLoopPauser';
import GlobeOrMap, { CameraView } from './GlobeOrMap';
import Mappable, { ImageryParts } from './Mappable';
import Terria from './Terria';
import TerriaViewer from '../ViewModels/TerriaViewer';
import TerrainProvider from 'terriajs-cesium/Source/Core/TerrainProvider'
import EllipsoidTerrainProvider from 'terriajs-cesium/Source/Core/EllipsoidTerrainProvider';
import FeatureDetection from 'terriajs-cesium/Source/Core/FeatureDetection';
import SingleTileImageryProvider from 'terriajs-cesium/Source/Scene/SingleTileImageryProvider';

// Intermediary
var cartesian3Scratch = new Cartesian3();
var enuToFixedScratch = new Matrix4();
var southwestScratch = new Cartesian3();
var southeastScratch = new Cartesian3();
var northeastScratch = new Cartesian3();
var northwestScratch = new Cartesian3();
var southwestCartographicScratch = new Cartographic();
var southeastCartographicScratch = new Cartographic();
var northeastCartographicScratch = new Cartographic();
var northwestCartographicScratch = new Cartographic();

export default class Cesium implements GlobeOrMap {
    readonly terria: Terria;
    readonly terriaViewer: TerriaViewer;
    readonly cesiumWidget: CesiumWidget;
    readonly scene: Scene;
    readonly dataSources: DataSourceCollection = new DataSourceCollection();
    dataSourceDisplay: Cesium.DataSourceDisplay | undefined;
    readonly pauser: CesiumRenderLoopPauser;
    private _terrainProvider: TerrainProvider = new EllipsoidTerrainProvider();

    private _disposeWorkbenchMapItemsSubscription: (() => void) | undefined;

    constructor(terriaViewer: TerriaViewer) {
        this.terriaViewer = terriaViewer
        this.terria = terriaViewer.terria;

        this._terrainProvider
        const terrainProvider = this._terrainProvider;

        //An arbitrary base64 encoded image used to populate the placeholder SingleTileImageryProvider
        var img = 'data:image/png;base64, iVBORw0KGgoAAAANSUhEUgAAAAUA \
    AAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO \
    9TXL0Y4OHwAAAABJRU5ErkJggg==';

        var options = {
            dataSources:  this.dataSources,
            clock:  this.terria.timelineClock,
            terrainProvider : terrainProvider,
            imageryProvider : new SingleTileImageryProvider({ url: img }),
            scene3DOnly: true,
            // Workaround for Firefox bug with WebGL and printing:
            // https://bugzilla.mozilla.org/show_bug.cgi?id=976173
            ...((<any>FeatureDetection).isFirefox() && {
                contextOptions: {webgl : {preserveDrawingBuffer : true}}
            })
        };



        //create CesiumViewer
        this.cesiumWidget = new CesiumWidget(this.terriaViewer.container, options);
        this.scene = this.cesiumWidget.scene;

        // Disable HDR lighting for better performance and to avoid changing imagery colors.
        (<any>this.scene).highDynamicRange = false;

        this.scene.imageryLayers.removeAll();

        //catch Cesium terrain provider down and switch to Ellipsoid
    //     terrainProvider.errorEvent.addEventListener(function(err) {
    //         console.log('Terrain provider error.  ', err.message);
    //         if (viewer.scene.terrainProvider instanceof CesiumTerrainProvider) {
    //             console.log('Switching to EllipsoidTerrainProvider.');
    //             that.terria.viewerMode = ViewerMode.CesiumEllipsoid;
    //             if (!defined(that.TerrainMessageViewed)) {
    //                 that.terria.error.raiseEvent({
    //                     title : 'Terrain Server Not Responding',
    //                     message : '\
    // The terrain server is not responding at the moment.  You can still use all the features of '+that.terria.appName+' \
    // but there will be no terrain detail in 3D mode.  We\'re sorry for the inconvenience.  Please try \
    // again later and the terrain server should be responding as expected.  If the issue persists, please contact \
    // us via email at '+that.terria.supportEmail+'.'
    //                 });
    //                 that.TerrainMessageViewed = true;
    //             }
    //         }
    //     });

        // if (defined(this._defaultTerriaCredit)) {
        //     var containerElement = getElement(container);
        //     var creditsElement = containerElement && containerElement.getElementsByClassName('cesium-widget-credits')[0];
        //     var logoContainer = creditsElement && creditsElement.getElementsByClassName('cesium-credit-logoContainer')[0];
        //     if (logoContainer) {
        //         creditsElement.insertBefore(this._defaultTerriaCredit.element, logoContainer);
        //     }
        // }

        this.scene.globe.depthTestAgainstTerrain = false;

        // var d = this._getDisclaimer();
        // if (d) {
        //     scene.frameState.creditDisplay.addDefaultCredit(d);
        // }

        // if (defined(this._developerAttribution)) {
        //     scene.frameState.creditDisplay.addDefaultCredit(createCredit(this._developerAttribution.text, this._developerAttribution.link));
        // }

        // scene.frameState.creditDisplay.addDefaultCredit(new Credit('<a href="http://cesiumjs.org" target="_blank" rel="noopener noreferrer">CESIUM</a>'));

        // var inputHandler = viewer.screenSpaceEventHandler;

        // // Add double click zoom
        // inputHandler.setInputAction(
        //     function (movement) {
        //         zoomIn(scene, movement.position);
        //     },
        //     ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
        // inputHandler.setInputAction(
        //     function (movement) {
        //         zoomOut(scene, movement.position);
        //     },
        //     ScreenSpaceEventType.LEFT_DOUBLE_CLICK, KeyboardEventModifier.SHIFT);

        this.pauser = new CesiumRenderLoopPauser(this.cesiumWidget);
    }

    destroy() {
        this.pauser.destroy();
        this.stopObserving();
        const cesiumWidget = this.cesiumWidget;

        // this.terria.cesium.destroy();
        // Port old Cesium.prototype.destroy stuff


        // if (this.cesiumEventHelper) {
        //     this.cesiumEventHelper.removeAll();
        //     this.cesiumEventHelper = undefined;
        // }

        if (this.dataSourceDisplay !== undefined) {
            this.dataSourceDisplay.destroy();
            this.dataSourceDisplay = undefined;
        }

        // this._enableSelectExtent(cesiumWidget.scene, false);

        // var inputHandler = cesiumWidget.screenSpaceEventHandler;
        // inputHandler.removeInputAction(ScreenSpaceEventType.MOUSE_MOVE);
        // inputHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
        // inputHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK, KeyboardEventModifier.SHIFT);

        // if (defined(this.monitor)) {
        //     this.monitor.destroy();
        //     this.monitor = undefined;
        // }
        cesiumWidget.destroy();
    }

    observeModelLayer() {
        this._disposeWorkbenchMapItemsSubscription = autorun(() => {
            const catalogItems = [
                ...this.terria.workbench.items,
                this.terria.baseMap
            ];
            // Flatmap
            const allMapItems = ([] as (DataSource | ImageryParts)[]).concat(
                ...catalogItems.filter(isDefined).filter(Mappable.is).map(item => item.mapItems)
            );
            // TODO: Look up the type in a map and call the associated function.
            //       That way the supported types of map items is extensible.

            const allDataSources = allMapItems.filter(isDataSource);

            // Remove deleted data sources
            let dataSources = this.dataSources;
            for (let i = 0; i < dataSources.length; i++) {
                const d = dataSources.get(i);
                if (allDataSources.indexOf(d) === -1) {
                    dataSources.remove(d);
                }
            }

            // Add new data sources
            allDataSources.forEach(d => {
                if (!dataSources.contains(d)) {
                    dataSources.add(d);
                }
            });

            // This is the Cesium ImageryLayer, not our Typescript one
            const allImageryParts = allMapItems
                .filter(ImageryParts.is)
                .map(
                    makeImageryLayerFromParts
                );

            // Delete imagery layers that are no longer in the model
            for (let i = 0; i < this.scene.imageryLayers.length; i++) {
                const imageryLayer = this.scene.imageryLayers.get(i);
                if (allImageryParts.indexOf(imageryLayer) === -1) {
                    this.scene.imageryLayers.remove(imageryLayer);
                    --i;
                }
            }
            // Iterate backwards so that adding multiple layers adds them in increasing cesium index order
            for (let modelIndex = allImageryParts.length - 1; modelIndex >= 0; modelIndex--) {
                const mapItem = allImageryParts[modelIndex];

                const targetCesiumIndex = allImageryParts.length - modelIndex - 1;
                const currentCesiumIndex = this.scene.imageryLayers.indexOf(mapItem);
                if (currentCesiumIndex === -1) {
                    this.scene.imageryLayers.add(mapItem, targetCesiumIndex);
                } else if (currentCesiumIndex > targetCesiumIndex) {
                    for (let j = currentCesiumIndex; j > targetCesiumIndex; j--) {
                        this.scene.imageryLayers.lower(mapItem);
                    }
                } else if (currentCesiumIndex < targetCesiumIndex) {
                    for (let j = currentCesiumIndex; j < targetCesiumIndex; j++) {
                        this.scene.imageryLayers.raise(mapItem);
                    }
                }
            }

            this.notifyRepaintRequired();
        });
    }

    stopObserving() {
        if (this._disposeWorkbenchMapItemsSubscription !== undefined) {
            this._disposeWorkbenchMapItemsSubscription();
        }
    }

    zoomTo(
        target: CameraView | Cesium.Rectangle | Cesium.DataSource | Mappable | /*TODO Cesium.Cesium3DTileset*/ any,
        flightDurationSeconds: number
    ): void {
        if (!defined(target)) {
            return;
            //throw new DeveloperError("viewOrExtent is required.");
        }

        flightDurationSeconds = defaultValue(flightDurationSeconds, 3.0);

        var that = this;

        return when()
            .then(function() {
                if (target instanceof Rectangle) {
                    var camera = that.scene.camera;

                    // Work out the destination that the camera would naturally fly to
                    var destinationCartesian = camera.getRectangleCameraCoordinates(
                        target
                    );
                    var destination = Ellipsoid.WGS84.cartesianToCartographic(
                        destinationCartesian
                    );
                    var terrainProvider = that.scene.globe.terrainProvider;
                    var level = 6; // A sufficiently coarse tile level that still has approximately accurate height
                    var positions = [Rectangle.center(target)];

                    // Perform an elevation query at the centre of the rectangle
                    return sampleTerrain(
                        terrainProvider,
                        level,
                        positions
                    ).then(function(results) {
                        var finalDestinationCartographic = new Cartographic(
                            destination.longitude,
                            destination.latitude,
                            destination.height + results[0].height
                        );

                        var finalDestination = Ellipsoid.WGS84.cartographicToCartesian(
                            finalDestinationCartographic
                        );

                        camera.flyTo({
                            duration: flightDurationSeconds,
                            destination: finalDestination
                        });
                    });
                } else if (defined(target.entities)) {
                    // Zooming to a DataSource
                    if (target.isLoading && defined(target.loadingEvent)) {
                        var deferred = when.defer();
                        var removeEvent = target.loadingEvent.addEventListener(function() {
                            removeEvent();
                            deferred.resolve();
                        });
                        return deferred.promise.then(function() {
                            return zoomToDataSource(that, target, flightDurationSeconds);
                        });
                    }
                    return zoomToDataSource(that, target);
                } else if (defined(target.readyPromise)) {
                    return target.readyPromise.then(function() {
                        if (defined(target.boundingSphere)) {
                            zoomToBoundingSphere(that, target, flightDurationSeconds);
                        }
                    });
                } else if (defined(target.boundingSphere)) {
                    return zoomToBoundingSphere(that, target);
                } else if (target.position !== undefined) {
                    that.scene.camera.flyTo({
                        duration: flightDurationSeconds,
                        destination: target.position,
                        orientation: {
                            direction: target.direction,
                            up: target.up
                        }
                    });
                } else if (Mappable.is(target)) {

                    if (isDefined(target.rectangle)) {

                        const {west, south, east, north} = target.rectangle;
                        if (isDefined(west) &&
                            isDefined(south) &&
                            isDefined(east) &&
                            isDefined(north))
                        {
                            return that.scene.camera.flyTo({
                                duration: flightDurationSeconds,
                                destination: Rectangle.fromDegrees(west, south, east, north)
                            });
                        }
                    }

                    if (target.mapItems.length > 0) {
                        // Zoom to the first item!
                        return that.zoomTo(target.mapItems[0], flightDurationSeconds);
                    }

                } else if(defined(target.rectangle)) {

                    that.scene.camera.flyTo({
                        duration: flightDurationSeconds,
                        destination: target.rectangle
                    });
                }
            })
            .then(function() {
                that.notifyRepaintRequired();
            });
    }

    notifyRepaintRequired() {
        this.pauser.notifyRepaintRequired();
    }

    getCurrentExtent() {
        const scene = this.scene;
        const camera = scene.camera;

        const width = scene.canvas.clientWidth;
        const height = scene.canvas.clientHeight;

        const centerOfScreen = new Cartesian2(width / 2.0, height / 2.0);
        const pickRay = scene.camera.getPickRay(centerOfScreen);
        const center = scene.globe.pick(pickRay, scene);

        if (!defined(center)) {
            // TODO: binary search to find the horizon point and use that as the center.
            return this.terriaViewer.defaultExtent; // This is just a random rectangle. Replace it when there's a home view available
            // return this.terria.homeView.rectangle;
        }

        const ellipsoid = this.scene.globe.ellipsoid;

        const frustrum = scene.camera.frustum as PerspectiveFrustum;

        const fovy = frustrum.fovy * 0.5;
        const fovx = Math.atan(Math.tan(fovy) * frustrum.aspectRatio);

        const cameraOffset = Cartesian3.subtract(camera.positionWC, center, cartesian3Scratch);
        const cameraHeight = Cartesian3.magnitude(cameraOffset);
        const xDistance = cameraHeight * Math.tan(fovx);
        const yDistance = cameraHeight * Math.tan(fovy);

        const southwestEnu = new Cartesian3(-xDistance, -yDistance, 0.0);
        const southeastEnu = new Cartesian3(xDistance, -yDistance, 0.0);
        const northeastEnu = new Cartesian3(xDistance, yDistance, 0.0);
        const northwestEnu = new Cartesian3(-xDistance, yDistance, 0.0);

        const enuToFixed = Transforms.eastNorthUpToFixedFrame(center, ellipsoid, enuToFixedScratch);
        const southwest = Matrix4.multiplyByPoint(enuToFixed, southwestEnu, southwestScratch);
        const southeast = Matrix4.multiplyByPoint(enuToFixed, southeastEnu, southeastScratch);
        const northeast = Matrix4.multiplyByPoint(enuToFixed, northeastEnu, northeastScratch);
        const northwest = Matrix4.multiplyByPoint(enuToFixed, northwestEnu, northwestScratch);

        const southwestCartographic = ellipsoid.cartesianToCartographic(southwest, southwestCartographicScratch);
        const southeastCartographic = ellipsoid.cartesianToCartographic(southeast, southeastCartographicScratch);
        const northeastCartographic = ellipsoid.cartesianToCartographic(northeast, northeastCartographicScratch);
        const northwestCartographic = ellipsoid.cartesianToCartographic(northwest, northwestCartographicScratch);

        // Account for date-line wrapping
        if (southeastCartographic.longitude < southwestCartographic.longitude) {
            southeastCartographic.longitude += CesiumMath.TWO_PI;
        }
        if (northeastCartographic.longitude < northwestCartographic.longitude) {
            northeastCartographic.longitude += CesiumMath.TWO_PI;
        }

        const rect = new Rectangle(
            CesiumMath.convertLongitudeRange(Math.min(southwestCartographic.longitude, northwestCartographic.longitude)),
            Math.min(southwestCartographic.latitude, southeastCartographic.latitude),
            CesiumMath.convertLongitudeRange(Math.max(northeastCartographic.longitude, southeastCartographic.longitude)),
            Math.max(northeastCartographic.latitude, northwestCartographic.latitude));

        // center isn't a member variable and doesn't seem to be used anywhere else in Terria
        // rect.center = center;
        return rect;
    }
}

var boundingSphereScratch = new BoundingSphere();

function zoomToDataSource(
    cesium: Cesium,
    target: Cesium.DataSource,
    flightDurationSeconds?: number
): Promise<void> {
    return pollToPromise(function() {
        const dataSourceDisplay = cesium.dataSourceDisplay;
        if (dataSourceDisplay === undefined) {
            return false;
        }

        var entities = target.entities.values;

        var boundingSpheres = [];
        for (var i = 0, len = entities.length; i < len; i++) {
            var state = BoundingSphereState.PENDING;
            try {
                // TODO: missing Cesium type info
                state = (<any>dataSourceDisplay).getBoundingSphere(entities[i], false, boundingSphereScratch);
            } catch (e) {
            }

            if (state === BoundingSphereState.PENDING) {
                return false;
            } else if (state !== BoundingSphereState.FAILED) {
                boundingSpheres.push(BoundingSphere.clone(boundingSphereScratch));
            }
        }

        var boundingSphere = BoundingSphere.fromBoundingSpheres(boundingSpheres);
        cesium.scene.camera.flyToBoundingSphere(boundingSphere, {
            duration : flightDurationSeconds
        });
        return true;
    }, {
        pollInterval: 100,
        timeout: 5000
    });
}

function zoomToBoundingSphere(
    cesium: Cesium,
    target: { boundingSphere: Cesium.BoundingSphere },
    flightDurationSeconds?: number
) {
    var boundingSphere = target.boundingSphere;
    cesium.scene.camera.flyToBoundingSphere(target.boundingSphere, {
        offset: new HeadingPitchRange(0.0, -0.5, boundingSphere.radius),
        duration: flightDurationSeconds
    });
}

const createImageryLayer: (ip: Cesium.ImageryProvider) => Cesium.ImageryLayer = createTransformer((ip: Cesium.ImageryProvider) => {
    console.log('Creating a new ImageryLayer');
    return new ImageryLayer(ip);
});

function makeImageryLayerFromParts(parts: ImageryParts): Cesium.ImageryLayer {
    const layer = createImageryLayer(parts.imageryProvider);

    layer.alpha = parts.alpha;
    layer.show = parts.show;
    return layer;
}

function isDataSource(object: DataSource | ImageryParts): object is DataSource {
    return "entities" in object;
}