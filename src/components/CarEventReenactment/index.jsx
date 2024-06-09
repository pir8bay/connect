import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import { withStyles } from '@material-ui/core';

import theme from '../../theme';
import Colors from '../../colors';
import ResizeHandler from '../ResizeHandler';

const styles = () => ({

});

const initialState = {
  windowWidth: window.innerWidth,
};


class RouteVisualizer extends Component {
  constructor(props) {
    super(props);
    this.state = {
      ...initialState,
    };

    this.onResize = this.onResize.bind(this);
  }

  componentDidMount() {

  }

  componentDidUpdate(prevProps) {

  }

  componentWillUnmount() {
    this.setState({ ...initialState });
  }


  onResize(windowWidth) {
    this.setState({ windowWidth });
  }


  render() {
    const { classes } = this.props;
    const {  } = this.state;

    return (
      <div
        ref={this.onContainerRef}
        className={classes.carEventReenactmentContainer}
        style={{ height: '100%', backgroundColor: Colors.black, display: 'flex', flexDirection: 'column'}}
      >
        
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