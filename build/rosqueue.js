/**
 * @author Peter Mitrano - pdmitrano@wpi.edu
 */

var ROSQUEUE = ROSQUEUE || {
  REVISION : '0.0.3-SNAPSHOT'
};
/**
 * @author Peter Mitrano - pdmitrano@wpi.edu
 */

/**
 * Communicates with rqueue_manager node to handle users.
 * Developed to allow multiple users to visit an interface to control a single robot
 * Users will be placed into a queue giving the first user control of the robot for a certain amount of time
 * When that user leaves, or their time ends, they will be kicked out and the next user gains control
 *
 * @constructor
 * @param options  - object with the following keys
 *      * ros - the ros ROSLIB.Ros connection handle
 *      * userId - the ID of the user, used to distinguish users
 *      * studyTime - time in minutes that the study is conducted for
 */
ROSQUEUE.Queue = function(options) {
  options = options || {};
  
  // roslib object used by all the publishers and subscribers
  this.ros = options.ros;
  // time in minutes that the study is conducted for
  this.studyTime = options.studyTime;
  // user Id, which is used to uniquely identify all users
  this.userId = options.userId;
  // variable to ensure enabled is only emit once
  this.sentActivate = false;


  // the publisher for dequeing
  this.updateQueueClient = new ROSLIB.Service({
    ros: this.ros,
    name: '/queue_manager/update_queue',
    serviceType: 'queue_manager/UpdateQueue'
  });

  // the subscriber for the queue published by the queue_manager
  this.queueSub = new ROSLIB.Topic({
    ros: this.ros,
    name: '/queue_manager/queue',
    messageType: 'queue_manager/Queue'
  });
};

/**
 * Publishes the user ID and adds the user to the queue.
 */
ROSQUEUE.Queue.prototype.enqueue = function () {
  var request = new ROSLIB.ServiceRequest({
    user_id : this.userId,
    enqueue : true,
    study_time : this.studyTime * 60 //the queue_manager node needs seconds
  });
  var that = this;
  // make the request
  this.updateQueueClient.callService(request, function(result) {
    // extracts user time left for a user and emits it to the interface so it can update
    that.queueSub.subscribe(function(message) {
      var time = {min:0, sec:0};
      for (var i = message.queue.length - 1; i >= 0; i--) {
        if (that.userId === message.queue[i].user_id) {
          //check if first/active user
          if (i === 0) {
            time.min =  Math.floor(message.queue[i].time_left.secs / 60);
            time.sec = message.queue[i].time_left.secs % 60;
            if (!that.sentActivate) {
              that.emit('activate');
              that.sentActivate = true;
            }
            that.emit('enabled', time);
          } else {
            //all other wait times are for users in queue
            time.min =  Math.floor(message.queue[i].wait_time.secs / 60);
            time.sec = message.queue[i].wait_time.secs % 60;
            that.emit('wait_time',time);
            that.emit('disabled');
          }
          //once the current user is found in the queue, exit the function
          return;
        }
      }
      //set interface to disabled/dequeued if you're not in the queue
      that.emit('disabled');
      that.emit('dequeue');
  
    });
    // the queue service request has returned
    that.emit('enqueue');
  });
};

/**
 * Remove the user from the queue.
 */
ROSQUEUE.Queue.prototype.dequeue = function () {
  var request = new ROSLIB.ServiceRequest({
    user_id : this.userId,
    enqueue : false,
    study_time : 0
  });
  var that = this;
  this.updateQueueClient.callService(request, function(result) {
    that.emit('dequeue');
  });
};
ROSQUEUE.Queue.prototype.__proto__ = EventEmitter2.prototype;
