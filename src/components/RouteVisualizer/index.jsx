import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import ReactMapGL, { Source, Layer } from 'react-map-gl';
import { withStyles, Typography, Select, MenuItem, FormControl } from '@material-ui/core';
import Radio from '@material-ui/core/Radio';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import dayjs from 'dayjs';
import axios from 'axios';

import { DEFAULT_LOCATION, MAPBOX_STYLE, MAPBOX_TOKEN } from '../../utils/geocode';
import theme from '../../theme';
import Colors from '../../colors';
import ResizeHandler from '../ResizeHandler';

const styles = () => ({
  mapContainer: {
    borderBottom: `1px solid ${Colors.white10}`,
  },
  mapError: {
    position: 'relative',
    marginTop: 20,
    marginLeft: 20,
    '& p': { color: Colors.white50 },
  },
  filterWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'end',
    position: 'absolute',
    top: 0,
    right: 0,
    width: 'fit-content',
    height: 'fit-content',
    padding: '10px',
    margin: '10px',
  },
  filterToggle: {
    width: 100,
    color: '#fff',
    padding: 3,
    marginBottom: 10,
    borderRadius: 15,
    border: '1px solid transparent',
    backgroundColor: '#5e8bff',
    '&:hover': {
      border: '1px solid #fff',
    },
  },
  filterContent: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(66, 74, 79, 0.95)',
  },
  legend: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    margin: 20,
  },
  legendTitle: {
    color: '#ffffff', 
    padding: 6, 
    borderRadius: 2, 
    fontSize: 14, 
    fontWeight: '500', 
    marginBottom: 7,
    backgroundColor: 'rgba(66, 74, 79, 0.95)'
  },
  legendItemWrapper: {
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: 5,
  },
  legendMarker: {
    height: 10,
    width: 10,
    marginRight: 5,
  },
});

const initialState = {
  hasFocus: false,
  windowWidth: window.innerWidth,
};


class RouteVisualizer extends Component {
  constructor(props) {
    super(props);
    this.state = {
      ...initialState,
      isPloted: false,
      showFilterOptions: true,
      selectedRouteColorOption: 'carEvents',
      selectedSpecificDateOption: 'All Dates',
      fetchedRoutes: {},
      filteredRoutes: null,
      lengthSliderValue: 0,
      durationSliderValue: 0,
      viewport: {
        ...DEFAULT_LOCATION,
        zoom: 5,
      },
      mapError: null,
      lines: null,
    };

    this.mapContainerRef = React.createRef();

    this.checkWebGLSupport = this.checkWebGLSupport.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onContainerRef = this.onContainerRef.bind(this);
    this.toggleFilterContent = this.toggleFilterContent.bind(this);
    this.handleFilterMouseDown = this.handleFilterMouseDown.bind(this);
    this.handleFilterMouseUp = this.handleFilterMouseUp.bind(this);
    this.handleRouteColor = this.handleRouteColor.bind(this);
    this.handleLengthSliderChange = this.handleLengthSliderChange.bind(this);
    this.handleSpecificDateDropdownFocus = this.handleSpecificDateDropdownFocus.bind(this);
    this.handleSpecificDateDropdownBlur = this.handleSpecificDateDropdownBlur.bind(this);
    this.handleSpecificDateChange = this.handleSpecificDateChange.bind(this);
  }

  componentDidMount() {
    this.checkWebGLSupport();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.routes !== this.props.routes) {
      this.plotRoutes();
    }
  }

  componentWillUnmount() {
    this.setState({ ...initialState });
  }

  checkWebGLSupport() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl || !(gl instanceof WebGLRenderingContext)) {
      this.setState({ mapError: 'Failed to get WebGL context, your browser or device may not support WebGL.' });
    }
  }

  onResize(windowWidth) {
    this.setState({ windowWidth });
  }

  onContainerRef(el) {
    this.mapContainerRef.current = el;
    if (el) {
      el.addEventListener('touchstart', (ev) => ev.stopPropagation());
    }
  }

  async fetchRoute(route) {
    const { start_lat, start_lng, end_lat, end_lng } = route;

    const routeKey = `${start_lat},${start_lng},${end_lat},${end_lng}`;
    if (this.state.fetchedRoutes[routeKey]) {
      return this.state.fetchedRoutes[routeKey];
    }

    const response = await axios.get(`https://api.mapbox.com/directions/v5/mapbox/driving/${start_lng},${start_lat};${end_lng},${end_lat}?geometries=geojson&access_token=${MAPBOX_TOKEN}`);
    const coordinates = response.data.routes[0].geometry.coordinates;

    this.setState(prevState => ({
      fetchedRoutes: {
        ...prevState.fetchedRoutes,
        [routeKey]: coordinates,
      },
    }));

    return coordinates;
  }

  calculateBoundingBox(points) {
    const minLng = Math.min(...points.map(point => point[0]));
    const maxLng = Math.max(...points.map(point => point[0]));
    const minLat = Math.min(...points.map(point => point[1]));
    const maxLat = Math.max(...points.map(point => point[1]));

    return { minLng, maxLng, minLat, maxLat };
  }

  calculateCenter(minLng, maxLng, minLat, maxLat) {
    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;

    return { centerLng, centerLat };
  }

  calculateZoom(minLng, maxLng, minLat, maxLat) {
    const lngDiff = maxLng - minLng;
    const latDiff = maxLat - minLat;

    const zoomLng = Math.round(Math.log(360 / lngDiff) / Math.log(2));
    const zoomLat = Math.round(Math.log(180 / latDiff) / Math.log(2));
    const zoom = Math.min(zoomLng, zoomLat);

    const zoomAdjustment = 0.4;
    return zoom + zoomAdjustment;
  }

  routeEventsColorRange(route) {
    if (!route.events) {
      return null;
    }

    const AlertStatusCodes = [
      'normal',
      'userPrompt',
      'critical',
    ];

    let routeSegmentColors = route.events
      .filter((event) => event.data && event.data.end_route_offset_millis)
      .map((event) => {
        const width = ((event.data.end_route_offset_millis - event.route_offset_millis) / route.duration) * 100;

        if (event.type === 'alert') {
          if (event.data.alertStatus) {
            const alertStatus = AlertStatusCodes[event.data.alertStatus];
            if (alertStatus === 'userPrompt') {
              return { percentage: width, color: theme.palette.states.alertOrange };
            } else if (alertStatus === 'critical') {
              return { percentage: width, color: theme.palette.states.alertRed };
            }
          }
        } else if (event.type === 'engage') {
          return { percentage: width, color: theme.palette.states.engagedGreen };
        } else if (event.type === 'overriding') {
          return { percentage: width, color: theme.palette.states.engagedGrey };
        } else if (event.type === 'flag') {
          return { percentage: width, color: theme.palette.states.userFlag };
        } else {
          return { percentage: width, color: theme.palette.states.drivingBlue };
        }
      });

    return routeSegmentColors;
  }

  assignRouteColor(route) {
    const { selectedRouteColorOption } = this.state;

    if (selectedRouteColorOption === 'carEvents') {
      return this.routeEventsColorRange(route);
    } else if (selectedRouteColorOption === 'routeLength') {
      if (route.length < 3) {
        return [{ percentage: 100, color: '#00FF00' }];
      } else if (route.length < 15) {
        return [{ percentage: 100, color: '#FFFF00' }];
      } else {
        return [{ percentage: 100, color: '#FF0000' }];
      }
    }
  }

  async plotRoutes() {
    const { routes } = this.props;
    const { viewport, filteredRoutes } = this.state;

    const routesToPlot = filteredRoutes !== null ? filteredRoutes : routes;

    if (!routesToPlot || routesToPlot.length === 0) {
      this.setState({ lines: [] });
      return;
    }

    console.log(routes)

    const linesAndColors = await Promise.all(routesToPlot.map(async route => {
      const coordinates = await this.fetchRoute(route);
      const color = this.assignRouteColor(route);
      return { coordinates, color };
    }));

    const points = [].concat(...linesAndColors.map(line => line.coordinates));

    const { minLng, maxLng, minLat, maxLat } = this.calculateBoundingBox(points);
    const { centerLng, centerLat } = this.calculateCenter(minLng, maxLng, minLat, maxLat);
    const zoom = this.calculateZoom(minLng, maxLng, minLat, maxLat);

    const newViewport = {
      ...viewport,
      longitude: centerLng,
      latitude: centerLat,
      zoom: zoom,
      transitionDuration: 1000,
    };

    this.setState({ viewport: newViewport, lines: linesAndColors, isPloted: true });
  }

  toggleFilterContent() {
    this.setState(prevState => ({ showFilterOptions: !prevState.showFilterOptions }));
  }

  handleFilterMouseDown(event) {
    if (event.target.closest('select') === null) {
      this.setState({ dragRotate: false, dragPan: false, scrollZoom: false });
    }
  }

  handleFilterMouseUp(event) {
    if (event.target.closest('select') === null) {
      this.setState({ dragRotate: true, dragPan: true, scrollZoom: true });
    }
  }

  handleRouteColor(event) {
    this.setState({ selectedRouteColorOption: event.target.value });
    this.plotRoutes();
  }

  renderFilterButton() {
    const { classes, showFilterOptions } = this.props;

    return (
      <button className={classes.filterToggle} onClick={this.toggleFilterContent}>
        {showFilterOptions ? 'Close' : 'Filter'}
      </button>
    );
  }

  renderRouteColorOptions() {
    return (
      <>
        <Typography style={{ fontWeight: 'bold', color: '#ffffff', marginTop: 5, marginBottom: 5 }}>Color Options :</Typography>
        <FormControlLabel
          control={<Radio color="primary" />}
          label="Based on car events"
          value="carEvents"
          checked={this.state.selectedRouteColorOption === 'carEvents'}
          onChange={this.handleRouteColor}
        />
        <FormControlLabel
          control={<Radio color="primary" />}
          label="Based on route length"
          value="routeLength"
          checked={this.state.selectedRouteColorOption === 'routeLength'}
          onChange={this.handleRouteColor}
        />
      </>
    );
  }

  handleLengthSliderChange() {
    const { routes } = this.props;
    const { lengthSliderValue } = this.state;

    this.setState({ filteredRoutes: null, durationSliderValue: 0, selectedSpecificDateOption: 'All Dates' });

    const filteredRoutes = routes.filter(route => route.length >= lengthSliderValue);

    this.setState({ filteredRoutes }, () => {
      this.plotRoutes();
    });
  }

  handleDurationSliderChange() {
    const { routes } = this.props;
    const { durationSliderValue } = this.state;

    this.setState({ filteredRoutes: null, lengthSliderValue: 0, selectedSpecificDateOption: 'All Dates' });

    const durationInMs = durationSliderValue * 60 * 1000;

    const filteredRoutes = routes.filter(route => route.duration >= durationInMs);

    this.setState({ filteredRoutes }, () => {
      this.plotRoutes();
    });
  }

  handleSpecificDateChange() {
    const { routes } = this.props;
    const { selectedSpecificDateOption } = this.state;

    this.setState({ filteredRoutes: null, lengthSliderValue: 0, durationSliderValue: 0 });

    if (selectedSpecificDateOption === 'All Dates') {
      this.setState({ filteredRoutes: null }, this.plotRoutes);
    } else {
      const filteredRoutes = routes.filter(route => dayjs(route.start_time).format('YYYY-MM-DD [at] h:mm A') === selectedSpecificDateOption);
      this.setState({ filteredRoutes }, this.plotRoutes);
    }
  }

  handleSpecificDateDropdownFocus() {
    this.setState({ dragRotate: false, dragPan: false, scrollZoom: false });
  }

  handleSpecificDateDropdownBlur() {
    this.setState({ dragRotate: true, dragPan: true, scrollZoom: true });
  }

  renderRouteSortOptions() {
    const { classes, routes } = this.props;
    const availableDates = ['All Dates', ...new Set(routes.map(route => dayjs(route.start_time).format('YYYY-MM-DD [at] h:mm A')))];

    return (
      <>
        <Typography style={{ fontWeight: 'bold', color: '#ffffff', marginTop: 7, marginBottom: 15 }}>Sort Options :</Typography>
        <Typography style={{ color: '#ffffff', marginBottom: 9 }}>Min Length: {this.state.lengthSliderValue} miles</Typography>
        <input
          type="range"
          min="0"
          max="30"
          value={this.state.lengthSliderValue}
          onChange={(event) => {
            this.setState({ lengthSliderValue: event.target.value }, this.handleLengthSliderChange);
          }}
          style={{ cursor: 'pointer' }}
        />
        <Typography style={{ color: '#ffffff', marginTop: 19, marginBottom: 12 }}>Min Duration: {this.state.durationSliderValue} minutes</Typography>
        <input
          type="range"
          min="0"
          max="30"
          value={this.state.durationSliderValue}
          onChange={(event) => {
            this.setState({ durationSliderValue: event.target.value }, this.handleDurationSliderChange);
          }}
          style={{ cursor: 'pointer' }}
        />
        <Typography style={{ color: '#ffffff', marginTop: 19, marginBottom: 12 }}>Specific Date:</Typography>
        <FormControl style={{ width: '100%' }}>
          <Select
            size="small"
            value={this.state.selectedSpecificDateOption}
            onChange={(event) => {
              this.setState({ selectedSpecificDateOption: event.target.value }, this.handleSpecificDateChange);
            }}
            onFocus={this.handleSpecificDateDropdownFocus}
            onBlur={this.handleSpecificDateDropdownBlur}
            className={classes.select}
            style={{ fontSize: '15px' }}
          >
            {availableDates.map((date, index) => (
              <MenuItem key={index} value={date} style={{ fontSize: '0.8rem' }}>
                {date}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </>
    );
  }

  renderFilterBox() {
    const { classes } = this.props;
    const { showFilterOptions } = this.state;

    return (
      <div className={classes.filterWrapper}
        onMouseDown={this.handleFilterMouseDown}
        onMouseUp={this.handleFilterMouseUp}
      >
        {this.renderFilterButton()}
        <div className={classes.filterContent} style={{ display: showFilterOptions ? 'block' : 'none' }}>
          {showFilterOptions && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {this.renderRouteColorOptions()}
              {this.renderRouteSortOptions()}
            </div>
          )}
        </div>
      </div>
    );
  }

  renderLegendItem(color, text, key) {
    const { classes } = this.props;

    return (
      <div key={key} className={classes.legendItem}>
        <div className={classes.legendMarker} style={{ backgroundColor: color }} />
        <Typography style={{ color: '#000000', fontSize: '14px' }}>{text}</Typography>
      </div>
    );
  }

  renderLegend() {
    const { classes } = this.props;

    const carEventsLegend = [
      { color: 'salmon', text: 'Event not found for route' },
      { color: theme.palette.states.alertOrange, text: 'Alert: user prompt' },
      { color: theme.palette.states.alertRed, text: 'Alert: critical' },
      { color: theme.palette.states.engagedGreen, text: 'Engage' },
      { color: theme.palette.states.engagedGrey, text: 'Overriding' },
      { color: theme.palette.states.drivingBlue, text: 'Disengage' },
      { color: theme.palette.states.userFlag, text: 'Flag' },
    ];

    const routeLengthLegend = [
      { color: '#00FF00', text: 'Short routes < 3 mi' },
      { color: '#FFFF00', text: 'Medium routes < 15mi' },
      { color: '#FF0000', text: 'Long routes ~' },
    ];

    const legendItems = this.state.selectedRouteColorOption === 'carEvents'
      ? carEventsLegend
      : this.state.selectedRouteColorOption === 'routeLength'
        ? routeLengthLegend
        : [];

    return (
      <div className={classes.legend}>
        <Typography className={classes.legendTitle} >Legend</Typography>
        <div className={classes.legendItemWrapper}>
          {legendItems.map(item => this.renderLegendItem(item.color, item.text, item.text))}
        </div>
      </div>
    );
  }

  render() {
    const { classes, hasNav } = this.props;
    const { mapError, hasFocus, viewport, lines, dragRotate, dragPan, scrollZoom } = this.state;

    return (
      <div
        ref={this.onContainerRef}
        className={classes.mapContainer}
        style={{ height: (hasFocus && hasNav) ? '60vh' : '87vh' }}
      >
        <ResizeHandler onResize={this.onResize} />
        {mapError
          && (
            <div className={classes.mapError}>
              <Typography>Could not initialize map.</Typography>
              <Typography>{mapError}</Typography>
            </div>
          )}
        <ReactMapGL
          latitude={viewport.latitude}
          longitude={viewport.longitude}
          zoom={viewport.zoom}
          bearing={viewport.bearing}
          pitch={viewport.pitch}
          mapStyle={MAPBOX_STYLE}
          width="100%"
          height="100%"
          maxPitch={0}
          mapboxApiAccessToken={MAPBOX_TOKEN}
          attributionControl={false}
          dragRotate={dragRotate}
          dragPan={dragPan}
          scrollZoom={scrollZoom}
          onError={(err) => this.setState({ mapError: err.error.message })}
          onViewportChange={(newViewport) => this.setState({ viewport: newViewport })}
        >
          {this.state.isPloted && this.renderFilterBox()}
          {lines && lines.flatMap((line, lineIndex) =>
            line.coordinates.map((coordinate, coordinateIndex, array) => {
              if (coordinateIndex === 0) return null; // Skip the first coordinate

              const segment = {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: [array[coordinateIndex - 1], coordinate]
                }
              };

              const totalCoordinates = line.coordinates.length;

              const colorRanges = line.color
                ? line.color.map(color => color !== undefined ? color : { percentage: 10, color: theme.palette.states.drivingBlue })
                : [{ percentage: 100, color: 'salmon' }];

              let accumulatedPercentage = 0;
              const color = (() => {
                const percentage = (coordinateIndex / totalCoordinates) * 100;

                for (let i = 0; i < colorRanges.length; i++) {
                  accumulatedPercentage += colorRanges[i].percentage;
                  if (percentage <= accumulatedPercentage) {
                    return colorRanges[i].color;
                  }
                }

                return theme.palette.states.drivingBlue;
              })();

              return (
                <Source key={`${lineIndex}-${coordinateIndex}`} id={`route-${lineIndex}-${coordinateIndex}`} type="geojson" data={segment}>
                  <Layer
                    id={`route-${lineIndex}-${coordinateIndex}`}
                    type="line"
                    source={`route-${lineIndex}-${coordinateIndex}`}
                    layout={{
                      'line-join': 'round',
                      'line-cap': 'round'
                    }}
                    paint={{
                      'line-color': color,
                      'line-width': 4
                    }}
                  />
                </Source>
              );
            })
          )}
          {this.renderLegend()}
        </ReactMapGL>
      </div>
    );
  }
}

const stateToProps = Obstruction({
  device: 'device',
  dongleId: 'dongleId',
  routes: 'routes',
});

export default connect(stateToProps)(withStyles(styles)(RouteVisualizer));