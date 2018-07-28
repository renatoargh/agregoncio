$(function () {
  $modal = $('#publish-events.modal')

  $('.event').on('click', function (e) {
    var $target = $(e.target)
    if ($target.prop('tagName') === 'I') {
      $target = $target.closest('a')
    }

    var event = $target.data('event')

    $modal.find('.modal-title').text('Publish "' + event + '" event')
    $modal.find('textarea').val('')

    $modal.modal('show')
  })
})