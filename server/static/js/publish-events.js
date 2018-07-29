$(function () {
  $modal = $('#publish-events.modal')

  $('.event').on('click', function (e) {
    var $target = $(e.target)
    if ($target.prop('tagName') === 'I') {
      $target = $target.closest('a')
    }

    var event = $target.data('event')
    var topicArn = $target.data('topicArn')

    var title = 'Publish "' + event + '" event'
    $modal.find('.modal-title').text(title)

    var $publish = $modal.find('button#publish')
    var $textarea = $modal.find('textarea')
    $publish.on('click', function (e) {
      var message = $textarea.val()

      try {
        message = JSON.parse(message)
      } catch (err) {
        return alert('Invalid json')
      }

      $.ajax({
        url: '/events',
        method: 'post',
        dataType: 'json',
        contentType: 'application/json',
        data: JSON.stringify({
          topicArn: topicArn,
          message: message
        })
      }).done(function () {
        $modal.modal('hide')
      })
    })

    $modal.on('shown.bs.modal', function () {
      $textarea.focus()
    })

    $modal.on('hidden.bs.modal', function () {
      $textarea.val('')
      $modal.off()
    })

    $modal.on('hide.bs.modal', function () {
      $publish.off()
    })

    $modal.modal('show')
  })
})
